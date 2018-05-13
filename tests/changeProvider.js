/**
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const mongoose = require('mongoose'),
 Promise = require('bluebird'),
 config = require('./config');

mongoose.Promise = Promise; // Use custom Promises
mongoose.connect(config.mongo.data.uri, {useMongoClient: true});
mongoose.accounts = mongoose.createConnection(config.mongo.accounts.uri);

const saveAccountForAddress = require('./helpers/saveAccountForAddress'),
  connectToQueue = require('./helpers/connectToQueue'),
  clearQueues = require('./helpers/clearQueues'),
  consumeMessages = require('./helpers/consumeMessages'),
  createTransaction = require('./helpers/createTransaction'),
  consumeStompMessages = require('./helpers/consumeStompMessages'),
  blockModel = require('../models/blockModel'),
  txModel = require('../models/txModel'),
  accountModel = require('../models/accountModel'),
  WebSocket = require('ws'),
  findProcess = require('find-process');
  expect = require('chai').expect,
  amqp = require('amqplib'),
  PROVIDER_CHECK_QUEUE = `${config.rabbit.serviceName}_provider_check`,
  Stomp = require('webstomp-client');

let amqpInstance,  accounts = config.dev.accounts;

describe('core/block processor -  change provider', function () {


  before(async () => {
    await saveAccountForAddress(accounts[0]);
    amqpInstance = await amqp.connect(config.rabbit.url);
    await clearQueues(amqpInstance, PROVIDER_CHECK_QUEUE);
  });

  after(async () => {
    await amqpInstance.close();
    await mongoose.disconnect();
  });

  afterEach(async () => {
    await clearQueues(amqpInstance, PROVIDER_CHECK_QUEUE);
  });


  it('send some nem and check provider 8010', async () => {
    let tx;
    return await Promise.all([
      (async () => {
        tx = await createTransaction(accounts[1], 0.000001);
        if (tx.code === 5) 
          throw new Error('Account has not balance');
        
      })(),
      (async () => {
        const channel = await amqpInstance.createChannel();  
        await channel.assertQueue(PROVIDER_CHECK_QUEUE, {autoDelete: true, durable: false});
        await channel.bindQueue(PROVIDER_CHECK_QUEUE, 'events', PROVIDER_CHECK_QUEUE);
        return new Promise(res => {
          let get8010 =false, get8011 =false;
          channel.consume(PROVIDER_CHECK_QUEUE, async (message) => {
            const content = JSON.parse(message.content);
            if (message.content === 8010) 
              get8010 =true;
            if (message.content === 8011) 
              get8011 =true;
            if (get8010 || get8011) {
               await channel.cancel(message.fields.consumerTag);
              res();
             }
          }, {noAck: true});
        });
      })()
    ]);
  });

  it('send some nem and check provider 8020', async () => {

    const processInfo = await findProcess('port', 8010);
    process.kill(processInfo[0].pid, 'SIGKILL');
    await Promise.delay(3000);

    const channel = await amqpInstance.createChannel();  
    await channel.assertQueue(PROVIDER_CHECK_QUEUE, {durable: false, autoDelete: true});
    await channel.bindQueue(PROVIDER_CHECK_QUEUE, 'events', PROVIDER_CHECK_QUEUE);
    
    await new Promise(res => {
      let get8020 =false, get8021 =false;
      channel.consume(PROVIDER_CHECK_QUEUE, async (message) => {
        if (message.content === 8020) 
          get8020 =true;
        if (message.content === 8021) 
          get8021 =true;
            if (get8020 || get8021) {
               await channel.cancel(message.fields.consumerTag);
              res();
             }
      }, {noAck: true});
    });
  });

  it('check provider main', async () => {
    const channel = await amqpInstance.createChannel();  
    await Promise.map([
      (async () => {
        const processInfo = await findProcess('port', 8020);
        process.kill(processInfo[0].pid, 'SIGKILL');
      })(),
      (async () => {
        await channel.assertQueue(`${config.rabbit.serviceName}_test1_provider`, {autoDelete: true});
        await channel.bindQueue(`${config.rabbit.serviceName}_test1_provider`, 'events', `${config.rabbit.serviceName}_provider`);
        await new Promise(res => {
          channel.consume(`${config.rabbit.serviceName}_test1_provider`, async (message) => {
            if (message.content.toString() === '2') {
              await channel.cancel(message.fields.consumerTag);
              res();  
             }
          }, {noAck: true});
        });
      })()
    ])
  });

  it('check what provider main', async () => {
    const channel = await amqpInstance.createChannel();  
    await Promise.all([
      (async () => {
        await channel.publish('events', `${config.rabbit.serviceName}_what_provider`, new Buffer('what'));
      })(),
      (async () => {
        await channel.assertQueue(`${config.rabbit.serviceName}_test_provider`, {autoDelete: true});
        await channel.bindQueue(`${config.rabbit.serviceName}_test_provider`, 'events', `${config.rabbit.serviceName}_provider`);
        
        await new Promise(res => {
          channel.consume(`${config.rabbit.serviceName}_test_provider`, async (message) => {
            if (message.content.toString() === '2') {
              await channel.cancel(message.fields.consumerTag);
              res();              
            }
          }, {noAck: true});
        });
      })()
    ])
  });

});