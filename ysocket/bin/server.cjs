#!/usr/bin/env node
const WebSocket = require("ws");
const http = require("http");
const express = require("express");
const cors = require("cors");
const number = require("lib0/number");
const wss = new WebSocket.Server({ noServer: true });
const Y = require("yjs");
const yUtils = require("./utils.cjs");
const { MongodbPersistence } = require("y-mongodb-provider");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors()); // 모든 도메인에서의 요청 허용

const server = http.createServer(app);
const host = "localhost";
const port = number.parseInt("8080");

const mdbUrl = "mongodb://mongodb:27017/webpro"; // 서버 DB URL
//const mdbUrl = "mongodb://127.0.0.1:27017/webpro"; // 테스트용 로컬 DB  URL

wss.on("connection", yUtils.setupWSConnection);

server.on("upgrade", (request, socket, head) => {
  // You may check auth of request here..
  // Call `wss.HandleUpgrade` *after* you checked whether the client has access
  // (e.g. by checking cookies, or url parameters).
  // See https://github.com/websockets/ws#client-authentication
  wss.handleUpgrade(
    request,
    socket,
    head,
    /** @param {any} ws */ (ws) => {
      wss.emit("connection", ws, request);
    }
  );
});

// MongoDB Persistence 생성
// localhost말고 IP를 직접 써야 문제가 없습니다.
// mongodb://<주소>:<포트번호>/<데이터베이스 이름>
// collectionName에 없는 콜렉션을 써도 자동으로 생성, 사용자(혹은 그룹) 구별에 유용할 것 같습니다.
const mdb = new MongodbPersistence(mdbUrl, {
  collectionName: "user1_manuscript",
  flushSize: 100,
  multipleCollections: false,
});

// MongoDB 자동저장
yUtils.setPersistence({
  provider: mdb,
  bindState: async (docName, ydoc) => {
    // Here you listen to granular document updates and store them in the database
    // You don't have to do this, but it ensures that you don't lose content when the server crashes
    // See https://github.com/yjs/yjs#Document-Updates for documentation on how to encode
    // document updates

    // official default code from: https://github.com/yjs/y-websocket/blob/37887badc1f00326855a29fc6b9197745866c3aa/bin/utils.js#L36
    const persistedYdoc = await mdb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    mdb.storeUpdate(docName, newUpdates);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on("update", async (update) => {
      mdb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName, ydoc) => {
    // This is called when all connections to the document are closed.
    // In the future, this method might also be called in intervals or after a certain number of updates.
    await mdb.flushDocument(docName); // 버퍼에 있는 나머지도 업데이트

    // return new Promise((resolve) => {
    //   // When the returned Promise resolves, the document will be destroyed.
    //   // So make sure that the document really has been written to the database.
    //   resolve();
    // });
  },
});

server.listen(port, () => {
  console.log(`running at '${host}' on port ${port}`);
});

// 원고 목록 반환 api
// POST /api/manuscripts
/* request 형식
  {
    "collectionName" : "사용자 이름"
  }
*/
/* response 형식
{
  "manuscripts": [
      "원고 1",
      "manuscript two",
      "One Go 셋"
  ]
}
*/
app.post("/api/manuscripts", async (req, res) => {
  const { collectionName } = req.body;
  console.log(`원고 목록 불러오기 : ${collectionName}`);

  const manuscriptListMdb = new MongodbPersistence(mdbUrl, {
    collectionName: collectionName,
    flushSize: 100,
    multipleCollections: false,
  });

  const allDocNames = await manuscriptListMdb.getAllDocNames();
  console.log(allDocNames);

  res.json({ manuscripts: allDocNames });
});
