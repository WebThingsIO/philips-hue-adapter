/**
 *
 * PhilipsHueAdapter - an adapter for controlling Philips Hue lights
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

var Adapter = require('../adapter');
var Device = require('../device');
var Property = require('../property');
var storage = require('node-persist');
var fetch = require('node-fetch');
var Color = require('color');

const THING_TYPE_ON_OFF_COLOR_LIGHT = 'onOffColorLight';
const THING_TYPE_ON_OFF_LIGHT = 'onOffLight';
const THING_TYPE_DIMMABLE_LIGHT = 'dimmableLight';

const KNOWN_BRIDGE_USERNAMES = 'PhilipsHueAdapter.knownBridgeUsernames';

/**
 * Property of a light bulb
 * Boolean on/off or numerical hue, sat(uration), or bri(ghtness)
 */
class PhilipsHueProperty extends Property {
  constructor(device, name, descr, value) {
    super(device, name, descr);
    this.setCachedValue(value);
  }

  /**
   * @param {boolean|number} value
   * @return {Promise} a promise which resolves to the updated value.
   */
  setValue(value) {
    let changed = this.value !== value;
    return new Promise(resolve => {
      this.setCachedValue(value);
      resolve(this.value);
      if (changed) {
        this.device.notifyPropertyChanged(this);
      }
    });
  }
}

/**
 * Convert from light properties to a CSS color string
 * @param {Object} props
 * @return {string} CSS string representing color
 */
function stateToCSS(state) {
  return Color({
    h: state.hue / 65535 * 360,
    s: state.sat / 254 * 100,
    v: state.bri / 254 * 100
  }).hex();
}

/**
 * Convert from light properties to a brightness value
 * @param {Object} state
 * @return {number} number representing brightness value
 */
function stateToLevel(state) {
  return  Math.round(state.bri / 254 * 100);
}

/**
 * Convert from a CSS color string to a light state object
 * @param {string} cssColor CSS string representing color
 * @return {Object}
 */
function cssToState(cssColor) {
  let color = Color(cssColor);

  return {
    hue: Math.round(color.hue() * 65535 / 360),
    sat: Math.round(color.saturationv() * 254 / 100),
    bri: Math.round(color.value() * 254 / 100)
  };
}

/**
 * Convert from a level value to a light state object
 * @param {number} level brightness value
 * @return {Object}
 */
function levelToState(level) {
  return {
    bri: Math.round(level * 254 / 100)
  };
}

/**
 * A Philips Hue light bulb
 */
class PhilipsHueDevice extends Device {
  /**
   * @param {PhilipsHueAdapter} adapter
   * @param {String} id - A globally unique identifier
   * @param {String} lightId - id of the light expected by the bridge API
   * @param {Object} light - the light API object
   */
  constructor(adapter, id, lightId, light) {
    super(adapter, id);

    this.lightId = lightId;
    this.name = light.name;

    this.type = THING_TYPE_ON_OFF_LIGHT;
    this.properties.set('on',
      new PhilipsHueProperty(this, 'on', {type: 'boolean'}, light.state.on));

    if (light.state.hasOwnProperty('bri')) {
      if (light.state.hasOwnProperty('xy')) {
        this.type = THING_TYPE_ON_OFF_COLOR_LIGHT;

        let color = stateToCSS(light.state);

        this.properties.set('color',
          new PhilipsHueProperty(this, 'color', {type: 'string'}, color));
      } else {
        this.type = THING_TYPE_DIMMABLE_LIGHT;

        let level = stateToLevel(light.state);

        this.properties.set('level',
          new PhilipsHueProperty(this, 'level', {type: 'number'}, level));

      }
    }

    this.adapter.handleDeviceAdded(this);
  }

  /**
   * Update the device based on the Hue API's view of it.
   * @param {Object} light - the light API object
   */
  update(light) {
    if (this.properties.has('on')) {
      let onProp = this.properties.get('on');
      if (onProp.value !== light.state.on) {
        onProp.setCachedValue(light.state.on);
        super.notifyPropertyChanged(onProp);
      }
    }

    if (this.properties.has('color')) {
      let color = stateToCSS(light.state);
      let colorProp = this.properties.get('color');
      if (color.toUpperCase() !== colorProp.value.toUpperCase()) {
        colorProp.setCachedValue(color);
        super.notifyPropertyChanged(colorProp);
      }
    }

    if (this.properties.has('level')) {
      let level = stateToLevel(light.state);
      let levelProp = this.properties.get('level');
      if (level !== levelProp.value) {
        levelProp.setCachedValue(level);
        super.notifyPropertyChanged(levelProp);
      }
    }
  }

  /**
   * When a property changes notify the Adapter to communicate with the bridge
   * TODO: batch property changes to not spam the bridge
   * @param {PhilipsHueProperty} property
   */
  notifyPropertyChanged(property) {
    super.notifyPropertyChanged(property);
    let properties = null;
    switch (property.name) {
      case 'color': {
        properties = cssToState(this.properties.get('color').value);
        break;
      }
      case 'on': {
        properties = {};
        // We might be turning on after changing the color/level
        if (this.properties.has('color')) {
          properties = cssToState(this.properties.get('color').value);
        } else if (this.properties.has('level')) {
          properties = levelToState(this.properties.get('level').value);
        }
        properties.on = this.properties.get('on').value;
        break;
      }
      case 'level': {
        properties = levelToState(this.properties.get('level').value);
        break;
      }
      default:
        console.warn('Unknown property:', property.name);
        return;
    }
    if (!properties) {
      return;
    }
    this.adapter.sendProperties(this.lightId, properties);
  }
}

/**
 * Philips Hue Bridge Adapter
 * Instantiates one PhilipsHueDevice per light
 * Handles the username acquisition (pairing) process
 */
class PhilipsHueAdapter extends Adapter {
  constructor(adapterManager, packageName, bridgeId, bridgeIp) {
    super(adapterManager, 'philips-hue-' + bridgeId, packageName);

    this.username = null;
    this.bridgeId = bridgeId;
    this.bridgeIp = bridgeIp;
    this.pairing = false;
    this.pairingEnd = 0;
    this.lights = {};
    this.updateLights = this.updateLights.bind(this);
    this.updateInterval = 1000;
    this.scheduledUpdate = null;
    this.recentlyUpdatedLights = {};

    adapterManager.addAdapter(this);

    storage.init().then(() => {
      return storage.getItem(KNOWN_BRIDGE_USERNAMES);
    }).then(knownBridgeUsernames => {
      if (!knownBridgeUsernames) {
        return Promise.reject('no known bridges');
      }

      var username = knownBridgeUsernames[this.bridgeId];
      if (!username) {
        return Promise.reject('no known username');
      }
      this.username = username;
      this.updateLights();
    }).catch(e => {
      console.error(e);
    });
  }

  /**
   * If we don't have a username try to acquire one from the bridge
   * @param {number} timeoutSeconds
   */
  startPairing(timeoutSeconds) {
    this.pairing = true;
    this.pairingEnd = Date.now() + timeoutSeconds * 1000;

    this.attemptPairing();
  }

  attemptPairing() {
    this.pair().then(username => {
      this.username = username;
      return this.updateLights();
    }).then(() => {
      return storage.init();
    }).then(() => {
      return storage.getItem(KNOWN_BRIDGE_USERNAMES);
    }).then(knownBridgeUsernames => {
      if (!knownBridgeUsernames) {
        knownBridgeUsernames = {};
      }
      knownBridgeUsernames[this.bridgeId] = this.username;
      return storage.setItem(KNOWN_BRIDGE_USERNAMES, knownBridgeUsernames);
    }).catch(e => {
      console.error(e);
      if (this.pairing && Date.now() < this.pairingEnd) {
        // Attempt pairing again later
        setTimeout(this.attemptPairing.bind(this), 500);
      }
    });
  }

  /**
   * Perform a single attempt at pairing with a Hue hub
   * @return {Promise} Resolved with username if pairing succeeds
   */
  pair() {
    if (this.username) {
      return Promise.resolve(this.username);
    }

    return fetch('http://' + this.bridgeIp + '/api', {
      method: 'POST',
      body: '{"devicetype":"mozilla_gateway#PhilipsHueAdapter"}'
    }).then(replyRaw => {
      return replyRaw.json();
    }).then(reply => {
      if (reply.length === 0) {
        return Promise.reject('empty response from bridge');
      }

      var msg = reply[0];
      if (msg.error) {
        return Promise.reject(msg.error);
      }

      return msg.success.username;
    });
  }

  cancelPairing() {
    this.pairing = false;
  }

  /**
   * Updates lights known to bridge, instantiating one PhilipsHueDevice per
   * light or updating the existing PhilipsHueDevice
   * @return {Promise}
   */
  updateLights() {
    if (!this.username) {
      return Promise.reject('missing username');
    }

    return fetch('http://' + this.bridgeIp + '/api/' + this.username +
                 '/lights').then(res => {
      return res.json();
    }).then(lights => {
      // TODO(hobinjk): dynamically remove lights
      for (var lightId in lights) {
        const light = lights[lightId];
        if (this.lights[lightId]) {
          // Skip the next update after a sendProperty
          if (this.recentlyUpdatedLights[lightId]) {
            delete this.recentlyUpdatedLights[lightId];
            continue;
          }

          this.lights[lightId].update(light);
          continue;
        }
        const id = 'philips-hue-' + this.bridgeId + '-' + lightId;
        this.lights[lightId] = new PhilipsHueDevice(this, id, lightId, light);
      }
      if (this.scheduledUpdate) {
        clearTimeout(this.scheduledUpdate);
      }
      this.scheduledUpdate = setTimeout(this.updateLights, this.updateInterval);

    }).catch(e => {
      console.warn('Error updating lights', e);
      if (this.scheduledUpdate) {
        clearTimeout(this.scheduledUpdate);
      }
      this.scheduledUpdate = setTimeout(this.updateLights, this.updateInterval);
    });
  }

  /**
   * Communicate the state of a light to the bridge
   * @param {String} lightId - Id of light usually from 1-n
   * @param {Object} properties - Updated properties of light to be sent
   * @return {Promise}
   */
  sendProperties(lightId, properties) {
    var uri = 'http://' + this.bridgeIp + '/api/' + this.username +
              '/lights/' + lightId + '/state';

    // Skip the next update after a sendProperty
    this.recentlyUpdatedLights[lightId] = true;
    return fetch(uri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(properties)
    }).then(res => {
      return res.text();
    }).catch(e => {
      console.error(e);
    });
  }
}

module.exports = PhilipsHueAdapter;
