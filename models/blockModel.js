/**
 * Mongoose model. Represents a block in eth
 * @module models/blockModel
 * @returns {Object} Mongoose model
 */

const mongoose = require('mongoose'),
  config = require('../config');

const Block = new mongoose.Schema({
  number: {type: Number, unique: true, index: true},
  timeStamp: {type: Number, required: true, index: true},
  type: {type: Number, required: true},
  transactions: [{
    timeStamp: {type: Number},
    hash: {type: String, index: true},
    amount: {type: Number, index: true},
    signature: {type: String},
    fee: {type: Number},
    recipient: {type: String, index: true},
    sender: {type: String, index: true},
    type: {type: String},
    deadline: {type: Number},
    message: {
      payload: {type: String},
      type: {type: Number}
    },
    mosaics: [{
      quantity: {type: Number},
      mosaicId: {
        namespaceId: {type: String},
        name: {type: String}
      }
    }],
    version: {type: Number},
    signer: {type: String},

  }],
  network: {type: String}
});

module.exports = mongoose.model(`${config.mongo.data.collectionPrefix}Block`, Block);
