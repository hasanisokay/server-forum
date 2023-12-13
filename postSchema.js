const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  author: {
    username: {
      type: String,
      required: true,
    },
  },
  followers: [{
    type: String,
  }],
}, {
  timestamps: true,
});

const Post = mongoose.model('Post', postSchema, 'posts');

module.exports = Post;