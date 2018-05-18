/**
 * Mongoose model. Represents a block in nem
 * @module models/blockModel
 * @returns {Object} Mongoose model
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
*/

const mongoose = require('mongoose'),
  config = require('../config');

const Block = new mongoose.Schema({
  number: {type: Number, unique: true, index: true},
  timeStamp: {type: Number, required: true, index: true},
  hash: {type: String, index: true},  
  type: {type: Number, required: true},
  signature: {type: String},
  version: {type: Number},
  signer: {type: String},
  txs: [{type: String}],
  prevBlockHash: {type: String}
});

module.exports = mongoose.model(`${config.mongo.data.collectionPrefix}Block`, Block);
