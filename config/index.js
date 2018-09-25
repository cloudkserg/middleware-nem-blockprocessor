/* 
* Copyright 2017–2018, LaborX PTY
* Licensed under the AGPL Version 3 license.
* @author Kirill Sergeev <cloudkserg11@gmail.com>
*/

const _ = require('lodash');

require('dotenv').config();

/** @function
 * @description build default connection URI
 * @returns {string}
 */

const getDefault = () => {
  return (
    (process.env.NIS || 'http://192.3.61.243:7890') + '@' +  
    (process.env.WEBSOCKET_NIS || 'http://192.3.61.243:7778')
  );
};


/**
 * @function
 * @description return the array of providers
 * @param providers - the string of providers
 * @returns Array<{uri: String, zmq: String}>
 */

const createConfigProviders = (providers) => {
  return _.chain(providers)
    .split(',')
    .map(provider => {
      const data = provider.split('@');
      return {
        http: data[0].trim(),
        ws: data[1].trim()
      };
    })
    .value();
};

/**
 *
 * @type {{
 *  mongo: {
 *    accounts: {
 *      uri: (*|string),
 *      collectionPrefix: (*|string)
 *      },
 *    data: {
 *      uri: (*|string),
 *      collectionPrefix: (*|string)
 *      }
 *  },
 *  sync: {
 *    shadow: number | boolean},
 *    node: {
 *      network: number,
 *      providers: Array<{uri: String, zmq: String}>},
 *      rabbit: {
 *        url: (string),
 *        serviceName: (string)
 *        }
 *      }
 *  }
 */

const config = {
  mongo: {
    accounts: {
      uri: process.env.MONGO_ACCOUNTS_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/data',
      collectionPrefix: process.env.MONGO_ACCOUNTS_COLLECTION_PREFIX || process.env.MONGO_COLLECTION_PREFIX || 'nem'
    },
    data: {
      uri: process.env.MONGO_DATA_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/data',
      collectionPrefix: process.env.MONGO_DATA_COLLECTION_PREFIX || process.env.MONGO_COLLECTION_PREFIX || 'nem'
    }
  },
  sync: {
    shadow: parseInt(process.env.SYNC_SHADOW) || true
  },
  node: {
    network: parseInt(process.env.NETWORK) || -104,
    providers: createConfigProviders(process.env.PROVIDERS || getDefault())
  },
  rabbit: {
    url: process.env.RABBIT_URI || 'amqp://localhost:5672',
    serviceName: process.env.RABBIT_SERVICE_NAME || 'app_nem'
  },
  systemRabbit: {
    url: process.env.SYSTEM_RABBIT_URI || process.env.RABBIT_URI || 'amqp://localhost:5672',
    exchange: process.env.SYSTEM_RABBIT_EXCHANGE || 'internal',
    serviceName: process.env.SYSTEM_RABBIT_SERVICE_NAME || 'system' 
  },
  checkSystem: process.env.CHECK_SYSTEM ? parseInt(process.env.CHECK_SYSTEM) : true,
  logs: {
    level: process.env.LOG_LEVEL || 'info'
  }
};

module.exports = config;
