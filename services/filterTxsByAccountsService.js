/**
 * Block processor
 * @module services/blockProcess
 * 
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Kirill Sergeev <cloudkserg11@gmail.com>
*/

const _ = require('lodash'),
  utils = require('../utils'),
  accountModel = require('../models/accountModel');

module.exports = async (txs) => {
  if (txs.length === 0)
    return [];
  /**
   * Search for tx's address occurence in DB
   * @type {string}
   */
  let query = {
    isActive: {
      $ne: false
    },
    address: {
      $in: _.chain(txs)
        .map(tx => [tx.sender, tx.recipient])
        .flattenDeep()
        .uniq()
        .value()
    }
  };

  const accounts = await accountModel.find(query);
  const nemAccounts = _.map(accounts, a => a.address);  
  if (_.isEmpty(nemAccounts))
    return [];
  

  /**
   * Filtering for customer's transactions
   * @type {Array}
   */
  return  _.reduce(txs, (acc, tx) => {
    _.each(
      _.intersection(
        [tx.sender, tx.recipient],
        nemAccounts
      ), 
      address => { acc.push(_.merge(tx, { address })); }
    );
    return acc;
  }, []);
};
