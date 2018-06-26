/**
 * index.js - Loads the Philips Hue bridge API adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const PhilipsHueAdapter = require('./philips-hue-adapter');
const fetch = require('node-fetch');
const SsdpClient = require('node-ssdp').Client;
const url = require('url');

const bridgeAdapters = {};

/**
 * Search for bridges using local SSDP
 * @return {Promise}
 */
function ssdpSearch(adapterManager, manifest) {
  const client = new SsdpClient();
  client.on('response', (headers) => {
    let bridgeId = headers['HUE-BRIDGEID'];
    if (!bridgeId) {
      return;
    }
    // Normalize bridge id
    bridgeId = bridgeId.toLowerCase();
    const bridgeIp = url.parse(headers.LOCATION).host;
    if (bridgeAdapters[bridgeId]) {
      return;
    }
    bridgeAdapters[bridgeId] =
      new PhilipsHueAdapter(adapterManager, manifest.name, bridgeId, bridgeIp);
  });

  return client.start().then(() => {
    client.search('ssdp:all');
  });
}

/**
 * Search for bridges using Philips's N-UPnP web API
 * @return {Promise}
 */
function discoverBridges(adapterManager, manifest) {
  return fetch('https://www.meethue.com/api/nupnp').then((res) => {
    return res.json();
  }).then((bridges) => {
    if (!bridges) {
      return Promise.reject('philips-hue: no bridges found');
    }
    // TODO(hobinjk): remove adapters whose bridges are offline
    for (const bridge of bridges) {
      // Normalize bridge id
      bridge.id = bridge.id.toLowerCase();
      if (bridgeAdapters[bridge.id]) {
        // TODO(hobinjk): update existing adapter's IP address if it has changed
        continue;
      }
      bridgeAdapters[bridge.id] = new PhilipsHueAdapter(
        adapterManager, manifest.name, bridge.id, bridge.internalipaddress);
    }
  }).catch((e) => {
    console.error('discoverBridges', e);
  });
}

/**
 * Perform both searches concurrently
 */
function loadPhilipsHueAdapters(adapterManager, manifest) {
  ssdpSearch(adapterManager, manifest);
  discoverBridges(adapterManager, manifest);
}

module.exports = loadPhilipsHueAdapters;
