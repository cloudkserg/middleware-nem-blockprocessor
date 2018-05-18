/** 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/
const request = require('request-promise'),
  _ = require('lodash'),
  {URL} = require('url'),
  Promise = require('bluebird'),
  hashes = require('./hashes');

const EMPTY_HEIGHT = -1;

const get = (url) => {
  return makeRequest(url, 'GET');
};

const makeRequest = (url, method, body) => {
  const options = {
    method,
    body,
    uri: url,
    json: true
  };
  return request(options);
};

const createUrl = (providerUri, path) => {
  return new URL(path, providerUri);
};

/**
 * @param {String} providerUri
 * @return {Promise return Number}
 */
const getHeightForProvider = async (providerUri) => {
  const res = await new Promise(res => {
    get(createUrl(providerUri, '/chain/height'))
      .then(res)
      .catch(() => {res({});});
  }).timeout(10000).catch(()=> {});
  return _.get(res, 'height', EMPTY_HEIGHT);
};



/**
 * 
 * @param {ProviderService} providerService 
 * @return {Object with functions}
 */
const createInstance = (providerService) => {
  
  const createProviderUrl = async (path) => {
    const provider = await providerService.getProvider();
    return createUrl(provider.getHttp(), path);
  };

  const post = async (path, body) => {
    const providerUrl = await createProviderUrl(path);
    return await makeRequest(providerUrl, 'POST', body);
  };

  return {
    /**
     * @param {Object} block 
     * @returns {Object}
     */
    createBlock (block) {
      if (!block.height) 
        return {};
      return _.merge(block, {
        hash: hashes.calculateBlockHash(block),
        number: Number(block.height)
      });
    },
    
    /**
     * 
     * @param {Number} height 
     * @return {Promise return Object}
     */
    async getBlockByNumber (height) {
      const block = await Promise.resolve(post('block/at/public', {height: (height > 1 ? height : 1)})).timeout(10000);

      if (!block || !block.height) 
        return {};
      
      return this.createBlock(block); 
    },

    /**
     * @return {Promise return Number}
     */
    async getLastBlockNumber () {
      await providerService.selectProvider();
      const provider = await providerService.getProvider();
      return provider.getHeight();
    },
    
    
    
    /**
     * 
     * @param {Array of Number} numbers 
     * @return {Promise return Object[]}
     */
    async getBlocksByNumbers (numbers) {
      return _.filter(
        await Promise.map(numbers, 
          async (number) => await this.getBlockByNumber(number)
        ), 
        block => block.height !== undefined
      );
    }
  };
};



module.exports = {
  getHeightForProvider,
  createInstance
};
