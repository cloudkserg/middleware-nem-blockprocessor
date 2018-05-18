/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const bunyan = require('bunyan'),
  _ = require('lodash'),
  Promise = require('bluebird'),
  EventEmitter = require('events'),
  allocateBlockBuckets = require('../utils/allocateBlockBuckets'),
  log = bunyan.createLogger({name: 'shared.services.syncCacheService'});

/**
 * @service
 * @description filter txs by registered addresses
 * @param block - an array of txs
 * @returns {Promise.<*>}
 */

class SyncCacheService {

  /**
   * Creates an instance of SyncCacheService.
   * @param {nodeRequests} requests
   * @param {blockRepository} repo
   * 
   * @memberOf SyncCacheService
   */
  constructor (requests, repo) {
    this.requests = requests;
    this.repo = repo;
    this.events = new EventEmitter();
    this.startIndex = 0;
    this.isSyncing = true;
  }

  async start (consensusAmount) {
    await this.indexCollection();
    let data = await allocateBlockBuckets(this.requests, this.repo, this.startIndex, consensusAmount);
    this.doJob(data.missedBuckets);
    return data.height;
  }

  async indexCollection () {
    log.info('indexing...');
    await this.repo.initModels();
    log.info('indexation completed!');
  }

  async doJob (buckets) {

    while (buckets.length)
      try {
        for (let bucket of buckets) {
          await this.runPeer(bucket);
          if (!bucket.length)
            _.pull(buckets, bucket);
        }

        this.events.emit('end');

      } catch (err) {

        if (err && (err.code === 'ENOENT' || err.code === 'ECONNECT')) {
          log.error('node is not available');
          process.exit(0);
        }

        log.error(err);
      }

  }

  async runPeer (bucket) {
    let lastBlock = await this.requests.getBlockByNumber(_.last(bucket));

    if (!lastBlock)
      return await Promise.delay(10000);

    log.info(`bitcoin provider took chuck of blocks ${bucket[0]} - ${_.last(bucket)}`);

    let blocksToProcess = [];
    for (let blockNumber = _.last(bucket); blockNumber >= bucket[0]; blockNumber--)
      blocksToProcess.push(blockNumber);

    await Promise.mapSeries(blocksToProcess, async (blockNumber) => {
      let block = await this.requests.getBlockByNumber(blockNumber);

      block = this.repo.transformRawBlock(block);
      await this.repo.saveBlock(block);
      _.pull(bucket, blockNumber);
      this.events.emit('block', block);
    });
  }
}

module.exports = SyncCacheService;
