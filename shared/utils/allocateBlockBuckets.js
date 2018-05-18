/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
 */

const _ = require('lodash'),
  bunyan = require('bunyan'),
  Promise = require('bluebird'),
  log = bunyan.createLogger({name: 'shared.utils.allocateBlockBuckets'});

const blockValidator = async (minBlock, maxBlock, chunkSize, repo) => {

  const data = [];

  const calculate = async (minBlock, maxBlock, chunkSize) => {
    let blocks = [];

    for (let blockNumber = minBlock; blockNumber <= maxBlock; blockNumber++)
      blocks.push(blockNumber);

    return await Promise.mapSeries(_.chunk(blocks, chunkSize), async (chunk) => {
      const minBlock = _.head(chunk);
      const maxBlock = _.last(chunk);
      log.info(`validating blocks from: ${minBlock} to ${maxBlock}`);

      const count = await repo.countBlocksForNumbers(minBlock, maxBlock);
      

      if (maxBlock !== minBlock && count !== maxBlock - minBlock + 1 && count)
        await calculate(minBlock, maxBlock, chunkSize / 10);

      if (!count)
        return data.push(minBlock === maxBlock ? [minBlock] : [minBlock, maxBlock]);

      return [];
    });
  };

  await calculate(minBlock, maxBlock, chunkSize);

  return data;
};

module.exports = async function (requests, repo) {

  let currentNodeHeight = await Promise.resolve(await requests.getLastBlockNumber()).timeout(10000).catch(() => -1);

  if (currentNodeHeight === -1)
    return Promise.reject({code: 0});

  let missedBuckets = await blockValidator(0, currentNodeHeight - 2, 100000, repo);
  missedBuckets = _.chain(missedBuckets).sortBy(item => item[0]).reverse().value();

  return {
    missedBuckets: missedBuckets,
    height: currentNodeHeight === 0 ? currentNodeHeight : currentNodeHeight - 1
  };

};
