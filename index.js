/**
 * Middleware service for handling NEM transactions on Chronobank platform
 * @module Chronobank/nem-blockprocessor
 * @requires config
 * @requires models/blockModel
 * @requires services/blockProcessService
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */


const config = require('./config'),
  Promise = require('bluebird'),
  mongoose = require('mongoose');

mongoose.Promise = Promise; // Use custom Promises
mongoose.connect(config.mongo.data.uri, {useMongoClient: true});
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri);

const _ = require('lodash'),
  bunyan = require('bunyan'),
  amqp = require('amqplib'),
  log = bunyan.createLogger({name: 'nem-blockprocessor'}),

  MasterNodeService = require('./shared/services/MasterNodeService'), 
  ProviderNodeService = require('./shared/services/ProviderNodeService'), 
  BlockWatchingService = require('./shared/services/blockWatchingService'),
  SyncCacheService = require('./shared/services/syncCacheService'),
  ProviderService = require('./shared/services/providerService'),

  blockRepo = require('./services/blockRepository'),
  NodeListenerService = require('./services/nodeListenerService'),   
  requests = require('./services/nodeRequests'),
  filterTxsByAccountsService = require('./services/filterTxsByAccountsService');

[mongoose.accounts, mongoose.connection].forEach(connection =>
  connection.on('disconnected', function () {
    log.error('mongo disconnected!');
    process.exit(0);
  })
);

const init = async () => {



  let amqpInstance = await amqp.connect(config.rabbit.url)
    .catch(() => {
      log.error('rabbitmq process has finished!');
      process.exit(0);
    });

  let channel = await amqpInstance.createChannel();

  channel.on('close', () => {
    log.error('rabbitmq process has finished!');
    process.exit(0);
  });

  await channel.assertExchange('events', 'topic', {durable: false});


  let blockEventCallback = async block => {
    log.info(`${block.hash} (${block.number}) added to cache.`);
    let filtered = await filterTxsByAccountsService(block.txs).catch(e=>console.log(e));
    await Promise.all(filtered.map(item =>
      channel.publish('events', `${config.rabbit.serviceName}_transaction.${item.address}`, new Buffer(JSON.stringify(Object.assign(item))))
    ));
  };
  let txEventCallback = async tx => {
    console.log(tx);
    let filtered = await filterTxsByAccountsService([tx]).catch(e=>console.log(e));;
    await Promise.all(filtered.map(item => 
      channel.publish('events', `${config.rabbit.serviceName}_transaction.${item.address}`, new Buffer(JSON.stringify(Object.assign(item))))
    ));
  };

  const masterNodeService = new MasterNodeService(channel, config.rabbit.serviceName);
  await masterNodeService.start();

  const providerService = new ProviderService(config.node.providers, requests.getHeightForProvider);
  const providerNodeService = new ProviderNodeService(channel, providerService, config.rabbit.serviceName);
  await providerNodeService.start();
  await providerService.selectProvider();
  

  const listener = new NodeListenerService(providerService);
  await listener.selectClient();

  const requestsInstance = requests.createInstance(providerService);
  const syncCacheService = new SyncCacheService(requestsInstance, blockRepo);


  syncCacheService.events.on('block', blockEventCallback);

  let endBlock = await syncCacheService.start(config.consensus.lastBlocksValidateAmount).catch((err) => {
    _.get(err, 'code') === 0 ? log.info('nodes are down or not synced!') : log.error(err);
    process.exit(0);
  });

  await new Promise(res => {
    if (config.sync.shadow)
      return res();

    syncCacheService.events.on('end', () => {
      log.info(`cached the whole blockchain up to block: ${endBlock}`);
      res();
    });
  });

  const blockWatchingService = new BlockWatchingService(requestsInstance, listener, blockRepo, endBlock);  
  blockWatchingService.events.on('block', blockEventCallback);
  blockWatchingService.events.on('tx', txEventCallback);

  const provider = await providerService.getProvider();
  await blockWatchingService.startSync(provider.getHeight()).catch(err => {
    if (_.get(err, 'code') === 0) {
      log.error('no connections available or blockchain is not synced!');
      process.exit(0);
    }
  });

};

module.exports = init();
