const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // model name, e.g. 'User'
  seq: { type: Number, default: 0 }
});

module.exports = mongoose.model('Counter', counterSchema);
