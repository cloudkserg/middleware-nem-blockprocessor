const blockModel = require('../../models/blockModel'),
  config = require('../../config'),
  _ = require('lodash'),
  nis = require('../../services/nisRequestService'),
  Promise = require('bluebird');

module.exports = () =>
  new Promise(res => {
    let check = async () => {
      let latestBlock = await nis.blockHeight();
      await Promise.delay(10000);
      let currentBlock = await blockModel.find({network: config.nis.network}).sort('-number').limit(1);
      _.get(currentBlock, '0.number', 0) > latestBlock - 10 ?
        res() : check();
    };
    check();
  });