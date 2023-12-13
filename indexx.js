const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();

// Enable CORS for all routes
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Adjust this to match the origin of your Next.js app
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected");
  socket.on("newComment", (dataToSendInSocket) => {
    io.emit("newComment", dataToSendInSocket);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

const port = 3001;

server.listen(port, () => {
  console.log(`Socket.io server listening on port ${port}`);
});
