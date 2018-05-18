/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */
const bunyan = require('bunyan'),
  _ = require('lodash'),
  Promise = require('bluebird'),

  EventEmitter = require('events'),
  log = bunyan.createLogger({name: 'shared.services.blockWatchingService'});

/**
 * @service
 * @description filter txs by registered addresses
 * @param block - an array of txs
 * @returns {Promise.<*>}
 */

class blockWatchingService {

  /**
   * Creates an instance of blockWatchingService.
   * @param {nodeRequests} requests
   * @param {NodeListenerService} listener
   * @param {blockRepository} repo
   * @param {Number} currentHeight
   *
   * @memberOf blockWatchingService

   *
   */
  constructor (requests, listener, repo, currentHeight) {

    this.requests = requests;
    this.listener = listener;
    this.repo = repo;
    this.events = new EventEmitter();
    this.currentHeight = currentHeight || 0;
    this.isSyncing = false;
    this.lastBlockHash = null;
  }

  async startSync (maxHeight) {

    if (this.isSyncing)
      return;

    this.isSyncing = true;

    if (!maxHeight)
      await this.repo.removeUnconfirmedTxs();

    log.info(`caching from block:${this.currentHeight}`);
    this.doJob();
    await this.listener.start();
    await this.listener.onMessage(tx => this.UnconfirmedTxEvent(tx));

  }

  async doJob () {

    while (this.isSyncing)
      try {
        const block = await Promise.resolve(this.processBlock()).timeout(60000 * 5);
        await this.repo.saveBlock(block);

        this.currentHeight++;
        this.lastBlockHash = block.hash;
        this.events.emit('block', block);
      } catch (err) {

        if (err && err.code === 'ENOENT') {
          log.error('connection is not available');
          process.exit(0);
        }

        if (err && err.code === 0) {
          log.info(`await for next block ${this.currentHeight}`);
          await Promise.delay(10000);
          continue;
        }

        if (_.get(err, 'code') === 1) {
          log.info(`wrong sync state!, rollback to ${this.currentHeight - 1} block`);

          const prevBlocks = await this.repo.findPrevBlocks(2);
          this.lastBlockHash = _.get(prevBlocks, '1.hash');
          this.currentHeight = _.get(prevBlocks, '0.number', 0);
          continue;
        }

        log.error(err);

      }
  }

  async UnconfirmedTxEvent (tx) {
    const txs = await this.repo.saveUnconfirmedTxs([tx]);
    this.events.emit('tx', txs[0]);
  }

  async stopSync () {
    this.isSyncing = false;
    await this.listener.stop();
  }

  async getNewBlock (number) {
    const maxHeight = await this.requests.getLastBlockNumber();
    if (number > maxHeight)
      return {};

    return await this.requests.getBlockByNumber(number);
  }

  async processBlock () {
    let block = await this.getNewBlock(this.currentHeight);
    if (!_.get(block, 'hash'))
      return Promise.reject({code: 0});

    if (this.lastBlockHash !== null && this.currentHeight > 1) {
      const isLastBlockSaved = await this.repo.isBlockExist(block.prevBlockHash.data);
      if (!isLastBlockSaved)
        return Promise.reject({code: 1});
    }

    return this.repo.transformRawBlock(block);
  }

}

module.exports = blockWatchingService;
