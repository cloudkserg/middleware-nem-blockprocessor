/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const  bunyan = require('bunyan'),
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

    this.networkId = '-104';
    this.consensusAmount = '';

  }

  setNetwork (networkName) {
    this.networkName = networkName;
  }

  setConsensusAmount (consensusAmount) {
    this.consensusAmount = consensusAmount;
  }

  async startSync (maxHeight) {

    if (this.isSyncing)
      return;

    this.isSyncing = true;

    if (!maxHeight) 
      await this.repo.removeUnconfirmedTxs();
    

    log.info(`caching from block:${this.currentHeight} for network:${this.networkId}`);
    this.doJob();
    await this.listener.start();
    await this.listener.onMessage( tx => this.UnconfirmedTxEvent(tx));
    
  }

  async doJob () {

    while (this.isSyncing)  
      try {
        const blockFromRequest = await Promise.resolve(this.processBlock()).timeout(60000*5);
        const blockWithTxsFromDb = await this.repo.saveBlock(blockFromRequest, blockFromRequest.transactions, async (err) => {
          if (err) {
            await this.repo.removeBlocksForNumbers(blockFromRequest.number, this.consensusAmount);
            await this.repo.removeTxsForNumbers(blockFromRequest.number);
            log.error(err);
            log.info(`wrong sync state!, rollback to ${blockFromRequest.number - this.consensusAmount - 1} block`);
          }
        });

        this.currentHeight++;
        this.lastBlockHash = blockWithTxsFromDb.hash;
        this.events.emit('block', blockWithTxsFromDb);
      } catch (err) {

        if (err && err.code === 'ENOENT') {
          log.error('connection is not available');
          process.exit(0);
        }

        if (err && err.code === 0) {
          log.info(`await for next block ${this.currentHeight + 1}`);
          await Promise.delay(10000);
          continue;
        }

        if ([1, 11000].includes(_.get(err, 'code'))) {
          const prevBlock = await this.repo.findPrevBlock(this.currentHeight);
          this.lastBlockHash = prevBlock.hash;
          this.currentHeight = prevBlock.number;
          continue;
        }

        if (![0, 1, 2, -32600].includes(_.get(err, 'code')))
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
    
    const block = await this.requests.getBlockByNumber(number).catch(() => {});
    return block;
  }

  async processBlock () {
    let block = await this.getNewBlock(this.currentHeight+1);
    if (!block || block.hash === undefined || block.number === null)  
      return Promise.reject({code: 0});
    

    if (this.lastBlockHash !== null) {
      const lastBlock = await this.requests.getBlockByNumber(this.currentHeight);
      if (lastBlock.hash !== this.lastBlockHash)
        return Promise.reject({code: 1});
    }

    return _.merge(this.repo.createBlock(block), {
      transactions: await this.repo.createTransactions(block.transactions),
    });
  }

}

module.exports = blockWatchingService;
