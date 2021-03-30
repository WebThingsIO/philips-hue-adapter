/**
 * index.js - Loads the Philips Hue bridge API adapter.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { AddonManagerProxy } from 'gateway-addon';
import { PhilipsHueAdapter } from './philips-hue-adapter';
import fetch from 'node-fetch';
import { Client as SsdpClient } from 'node-ssdp';

const bridgeAdapters: Record<string, PhilipsHueAdapter> = {};

interface Bridge {
  id: string;
  internalipaddress: string;
}

/**
 * Search for bridges using local SSDP
 * @return {Promise}
 */
async function ssdpSearch(addonManager: AddonManagerProxy): Promise<void> {
  const client = new SsdpClient();

  client.on('response', (headers) => {
    let bridgeId = headers['HUE-BRIDGEID'];

    if (typeof bridgeId !== 'string') {
      return;
    }

    bridgeId = bridgeId.toLowerCase();

    const location = headers.LOCATION;

    if (typeof location !== 'string') {
      return;
    }

    const bridgeIp = new URL(location).host;

    if (!bridgeAdapters[bridgeId]) {
      console.log(`Found new bridge ${bridgeId} at ${location} via ssdp`);

      bridgeAdapters[bridgeId] = new PhilipsHueAdapter(addonManager, bridgeId, bridgeIp);
    }
  });

  await client.start();
  await client.search('ssdp:all');
}

/**
 * Search for bridges using Philips's N-UPnP web API
 * @return {Promise}
 */
async function discoverBridges(addonManager: AddonManagerProxy): Promise<void> {
  const response = await fetch('https://discovery.meethue.com');
  const bridges: Bridge[] = await response.json();

  if (!bridges) {
    return Promise.reject('philips-hue: no bridges found');
  }

  for (const bridge of bridges) {
    const { id, internalipaddress } = bridge;

    const bridgeId = id.toLowerCase();

    if (!bridgeAdapters[bridgeId]) {
      console.log(`Found new bridge ${bridgeId} at ${internalipaddress} via meethue api`);

      bridgeAdapters[bridgeId] = new PhilipsHueAdapter(addonManager, bridgeId, internalipaddress);
    }
  }
}

/**
 * Perform both searches concurrently
 */
export = async function (addonManager: AddonManagerProxy): Promise<void> {
  ssdpSearch(addonManager);
  discoverBridges(addonManager);
};
