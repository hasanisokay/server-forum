const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const Post = require("./postSchema");
const User = require("./userSchema");
require("dotenv").config();

const app = express();
app.use(cors());

const loggedUsers = new Set();
const anonymousUsers = new Set();

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

mongoose.connect(process.env.MONGODB_URI, { dbName: "ruqyahbd-forum" });

const db = mongoose.connection;
db.on("connected", () => {
  console.log("Connected to MongoDB");
});
db.on("error", (error) => {
  console.error("MongoDB connection error:", error);
});

const messageSchema = new mongoose.Schema({
  groupId: String,
  user: String,
  text: String,
  timestamp: { type: Date, default: Date.now },
});

const Message = mongoose.model("Message", messageSchema);

const handleSocketConnection = (socket, groupId) => {
  console.log(`User connected to ${groupId}`);

  socket.on("sendMessage", async (data) => {
    const { user, text } = data;
    const message = new Message({ groupId, user, text });

    try {
      await message.save();
      io.of(`/${groupId}`).emit("message", message);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected from ${groupId}`);
  });
};

const groups = ["group1", "group2", "group3"];

groups.forEach((groupId) => {
  io.of(`/${groupId}`).on("connection", async (socket) => {
    const { page = 1 } = socket.handshake.query;
    const pageSize = 10;
    const skip = (page - 1) * pageSize;

    try {
      const recentMessages = await Message.find({ groupId })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(pageSize)
        .exec();

      socket.emit("recentMessages", recentMessages);
      handleSocketConnection(socket, groupId);
    } catch (error) {
      console.error("Error fetching recent messages:", error);
    }
  });
});

io.on("connection", async (socket) => {
  console.log("Client connected");
console.log(loggedUsers);
console.log(anonymousUsers);
if (socket.handshake.query.userId) {
  const userId = socket.handshake.query.userId;
  
  loggedUsers.add(userId);

  anonymousUsers.delete(socket.id);

  io.emit("userConnected", {
    loggedInUsersCount: loggedUsers.size,
    anonymousUsersCount: anonymousUsers.size,
  });
} else {
  const anonymousUserId = socket.id;
  anonymousUsers.add(anonymousUserId);

  io.emit("anonymousUserConnected", {
    loggedInUsersCount: loggedUsers.size,
    anonymousUsersCount: anonymousUsers.size,
  });
}

  socket.on("joinRoom", ({ roomId }) => {
    socket.join(roomId);
  });
  socket.on("join", ({ username }) => {
    socket.join(username);
    console.log("joined", username);
  });
  socket.on("newReply", async (dataToSendInSocket) => {
    try {
      io.to(dataToSendInSocket.postID).emit("newReply", dataToSendInSocket);
    } catch (error) {
      console.error("Error emitting newReply event:", error);
    }
  });
  socket.on("newComment", async (dataToSendInSocket) => {
    try {
      io.to(dataToSendInSocket.postID).emit("newComment", dataToSendInSocket);
    } catch (error) {
      console.error("Error emitting newComment event:", error);
    }
  });

  socket.on("newReport", async ({ newCommentNotification }) => {
    try {
      const isAdminUsers = await User.find({ isAdmin: true }).distinct(
        "username"
      );

      isAdminUsers.forEach((username) => {
        io.to(username).emit("newReport", { newCommentNotification });
      });
    } catch (error) {
      console.error("Error emitting newReport event:", error);
    }
  });

  socket.on(
    "newCommentNotification",
    async ({ newCommentNotification }) => {
      const {
        postID,
      } = newCommentNotification;

      try {
        const post = await Post.findById(postID)
          .select("followers")
          .exec();
        if (!post) {
          console.error("Post not found");
          return;
        }
        const followers = post?.followers;

        followers?.forEach((username) => {
          io.to(username).emit("newCommentNotification", newCommentNotification);
        });

      } catch (error) {
        console.error("Error emitting notification event:", error);
      }
    }
  );

  socket.on("leaveRoom", ({ roomId }) => {
    socket.leave(roomId);
  });
  socket.on("leave", ({ username }) => {
    socket.leave(username);
  });
  socket.on("disconnect", () => {
    console.log("Client disconnected");

    if (socket.handshake.query.userId) {
      const userId = socket.handshake.query.userId;
      loggedUsers.delete(userId);
      io.emit("userDisconnected", {
        loggedInUsersCount: loggedUsers.size,
        anonymousUsersCount: anonymousUsers.size,
      });
    } else {
      const anonymousUserId = socket.id;
      anonymousUsers.delete(anonymousUserId);
      io.emit("anonymousUserDisconnected", {
        loggedInUsersCount: loggedUsers.size,
        anonymousUsersCount: anonymousUsers.size,
      });
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
