/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const config = require('../config'),
  _ = require('lodash'),
  sem = require('semaphore')(1),
  nem = require('nem-sdk').default,
  hashes = require('./hashes'),

  blockModel = require('../models/blockModel'),
  txModel = require('../models/txModel'),
  bunyan = require('bunyan'),
  log = bunyan.createLogger({name: 'app.services.blockRepository'});

/**
 * @return {Promise}
 */
const removeUnconfirmedTxs = async () => {
  await txModel.remove({
    blockNumber: -1
  });
};

/**
 *
 * @param Array<txModel> txs
 * @return {Promise return [{Object} of tx]}
 */
const saveUnconfirmedTxs = async (txs) => {
  txs = txs.map(tx => transformTx(tx, -1));
  await txModel.insertMany(txs);
  return txs;
};

const findPrevBlocks = async (depth) => {
  return await blockModel.find({
    number: {$gte: 0}
  }).sort({number: -1}).limit(depth);
};


const isBlockExist = async (hash) => {
  return (await blockModel.count({hash: hash})) !== 0;
};

const transformTx = (tx, blockNumber) => {


  const sender = !tx.sender && tx.signer ? nem.model.address.toAddress(tx.signer, config.node.network) : tx.sender;

  return {
    blockNumber: blockNumber,
    timeStamp: tx.timeStamp,
    amount: tx.amount || null,
    hash: hashes.calculateTransactionHash(tx),
    recipient: tx.recipient,
    sender: sender,
    fee: tx.fee,
    messagePayload: _.get(tx, 'message.payload', null),
    messageType: _.get(tx, 'message.type', null),
    mosaics: tx.mosaics || null
  };

};

/**
 *
 * @param {blockModel} block
 * @param {Array of Object} txs
 * @return {blockModel}
 */
const transformRawBlock = (block) => {

  const txs = block.transactions.map(tx => transformTx(tx, block.number));

  return {
    number: block.height,
    timeStamp: block.time || Date.now(),
    hash: hashes.calculateBlockHash(block),
    type: block.type,
    signature: block.signature,
    version: block.version,
    signer: block.signer,
    txs: txs,
    prevBlockHash: block.prevBlockHash.data
  };

};

/**
 * @return {Promise}
 */
const initModels = async () => {
  await blockModel.init();
  await txModel.init();
};

/**
 * @param {blockModel} inputBlock
 * @param {Array of txModel} inputTxs
 * @param {function return Promise} afterSave
 * @return {Promise return Object {block merge with transactions}}
 *
 **/
const saveBlock = async (block) => {
  return await new Promise(async (res, rej) => {
    sem.take(async () => {
      try {
        const savedBlock = await updateDbStateWithBlock(block);
        res(savedBlock);
        sem.leave();

      } catch (e) {
        await rollbackStateForBlock(block.number);
        sem.leave();
        rej({code: 1});
      }
    });
  });
};

/**
 *
 * @param {Number} blockNumber
 * @return {Promise}
 */
const rollbackStateForBlock = async (blockNumber) => {
  log.info(`wrong sync state!, rollback to ${blockNumber} block`);
  await blockModel.remove({number: {$gte: blockNumber}});
  await txModel.remove({blockNumber: {$gte: blockNumber}});
};

const updateDbStateWithBlock = async (block) => {

  let bulkOps = block.txs.map(tx => {
    return {
      updateOne: {
        filter: {hash: tx.hash},
        update: tx,
        upsert: true
      }
    }
  });

  if (bulkOps.length)
    await txModel.bulkWrite(bulkOps);

  const toSaveBlock = _.merge({}, block, {txs: block.txs.map(tx => tx.hash)});
  return await blockModel.findOneAndUpdate({number: toSaveBlock.number}, toSaveBlock, {upsert: true});
};

/**
 *
 * @param {Number} minBlock
 * @param {Number} maxBlock
 * @return {Promise return Array of blockModel}
 */
const countBlocksForNumbers = async (minBlock, maxBlock) => {
  return await blockModel.count(minBlock === maxBlock ? {number: minBlock} : {
    $and: [
      {number: {$gte: minBlock}},
      {number: {$lte: maxBlock}}
    ]
  });
};

module.exports = {
  initModels,
  countBlocksForNumbers,
  saveBlock,
  findPrevBlocks,
  transformRawBlock,
  saveUnconfirmedTxs,
  removeUnconfirmedTxs,
  isBlockExist
};
