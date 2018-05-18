/**
 * Mongoose model. Represents a transaction in nem
 * @module models/txModel
 * @returns {Object} Mongoose model
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Vesrsion 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
*/

const mongoose = require('mongoose'),
  config = require('../config');

const TX = new mongoose.Schema({
  blockNumber: {type: Number, required: true, index: true, default: -1},
  timeStamp: {type: Number, required: true, index: true, default: Date.now},
  amount: {type: Number, index: true},
  hash: {type: String, index: true, unique: true},
  recipient: {type: String, index: true},
  sender: {type: String, index: true},
  fee: {type: Number},
  messagePayload: {type: String},
  messageType: {type: Number},

  mosaics: [{
    quantity: {type: Number},
    type: {type: String},      
    supplyType: {type: String},
    delta: {type: String},
    fee: {type: String},
    deadline: {type: String},
    version: {type: Number},
    signature: {type: String},
    timestamp: {type: Number},
    mosaicId: {
      namespaceId: {type: String},
      name: {type: String}
    }
  }]
});

module.exports = mongoose.model(`${config.mongo.data.collectionPrefix}TX`, TX);
