/**
 * Copyright 2017–2018, LaborX PTY
 * Licensed under the AGPL Version 3 license.
 * @author Egor Zuev <zyev.egor@gmail.com>
 */
const EventEmitter = require('events'),
  hashes = require('../hashes/hashes'),
  Promise = require('bluebird'),
  _ = require('lodash'),
  request = require('request-promise'),
  URL = require('url').URL,
  SockJS = require('sockjs-client'),
  Stomp = require('webstomp-client');

/**
 * @service
 * @param URI - the endpoint URI
 * @description http provider for nem node
 */

class Api {

  constructor (URI) {
    this.http = URI.http;
    this.ws = URI.ws;
    this.events = new EventEmitter();
  }

  /**
   * @function
   * @internal
   * @description build ws provider for the connector
   * @return {Client}
   */
  _buildWSProvider () {
    const ws = new SockJS(`${this.ws}/w/messages`);
    const client = Stomp.over(ws, {heartbeat: true, debug: false});
    ws.onclose = () => this.events.emit('disconnect');
    ws.onerror = () => this.events.emit('disconnect');
    return client;
  }

  /**
   * @function
   * @description open ws provider
   * @return {Promise<void>}
   */
  async openWSProvider (){
    if(!this.wsProvider)
      this.wsProvider = this._buildWSProvider();

    return await new Promise((res, rej)=>{
      this.wsProvider.connect({}, res, rej);
    });
  }

  /**
   * @function
   * @description internal method for making requests
   * @param url - endpoint url
   * @param method - the HTTP method
   * @param body - the body of the request
   * @return {Promise<*>}
   * @private
   */
  async _makeRequest (url, method = 'GET', body) {
    const options = {
      method: method,
      body: body,
      uri: new URL(url, this.http),
      json: true
    };

    try {
      return await Promise.resolve(request(options)).timeout(10000);
    }catch (e) {
      await Promise.delay(1000);
      this.events.emit('disconnect');
      return null;
    }


  }

  /**
   * @function
   * @description get block by it's number
   * @param height
   * @return {Promise<{}>}
   */
  async getBlockByNumber (height) {
    const block = await this._makeRequest('block/at/public', 'POST', {height: (height > 1 ? height : 1)});

    if (!block || !block.height)
      return {};

    return _.merge(block, {
      hash: hashes.calculateBlockHash(block),
      number: Number(block.height)
    });
  }

  async getUnconfirmedTransaction (address) {
    const data = await this._makeRequest('account/unconfirmedTransactions?address=' + address);
    return data.data[0].transaction;
  }

  async getTransaction (address, hash) {
    let url = 'account/transfers/all?address=' + address;
    if (hash)
      url += '&hash=' + hash;
    const data = await this._makeRequest(url);
    return data.data[0].transaction;
  }

  /**
   * @function
   * @description get blockchain current height
   * @return {Promise<*>}
   */
  async getHeight () {
    const data = await this._makeRequest('chain/height');
    return data.height;
  }


  /**
   * @function
   * @description check node health
   * @return {Promise<*>}
   */
  async heartbeat () {
    const data = await this._makeRequest('heartbeat');
    return data.code;
  }

}

module.exports = Api;
