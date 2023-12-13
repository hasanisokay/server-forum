const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const Post = require("./postSchema");
require("dotenv").config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
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
  socket.on("joinRoom", ({ roomId }) => {
    socket.join(roomId);
  });
  socket.on("join", ({ username }) => {
    socket.join(username);
  });
  socket.on("newReply", (dataToSendInSocket) => {
    try {
      io.to(dataToSendInSocket.postID).emit("newReply", dataToSendInSocket);
    } catch (error) {
      console.error("Error emitting newReply event:", error);
    }
  });
  socket.on("newComment", (dataToSendInSocket) => {
    try {
      io.to(dataToSendInSocket.postID).emit("newComment", dataToSendInSocket);
    } catch (error) {
      console.error("Error emitting newComment event:", error);
    }
  });

  socket.on("newCommentNotification", async ({ newCommentNotification, commentID }) => {
    const { commenterUsername, commenterName, date, postID } =
      newCommentNotification;

    try {
      const post = await Post.findById(postID)
        .select("followers author")
        .exec();
      if (!post) {
        console.error("Post not found");
        return;
      }
      const followers = post?.followers.filter(
        (username) => username !== commenterUsername
      );
      const postAuthor = post?.author?.username;
      const newNotification = {
        commenterUsername,
        date,
        message: commentID ? `${commenterName} replied to a comment you are following.` : `${commenterName} commented on a post you are following.`,
        postID,
        read: false,
      };

      // sending notifications to followers
      followers?.forEach((username) => {
        io.to(username).emit("newCommentNotification", newNotification);
      });

      // sending notification to post author
      if (postAuthor !== commenterUsername) {
        newNotification.message = commentID ? `${commenterName} replied to a comment on your post.` : `${commenterName} commented on your post.`;
        io.to(postAuthor).emit("newCommentNotification", newNotification);
      }
    } catch (error) {
      console.error("Error emitting notification event:", error);
    }
  });

  socket.on("leaveRoom", ({ roomId }) => {
    socket.leave(roomId);
  });
  socket.on("leave", ({ username }) => {
    socket.leave(username);
  });
  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

app.get("/api/messages", async (req, res) => {
  const { groupId, page = 1 } = req.query;
  const pageSize = 20;
  const skip = (page - 1) * pageSize;

  try {
    const messages = await Message.find({ groupId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec();
    res.json({ messages });
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
