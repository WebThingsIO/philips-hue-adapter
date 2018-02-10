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
 * Convert from {xy, brightness} to a CSS color string
 * @param {Array<number>} xy - CIE xy coordinates of color
 * @param {number} bri - Brightness of color
 * @return {string} CSS string representing color
 */
function xyBriToCSS([x, y], bri) {
  // From https://developers.meethue.com/documentation/color-conversions-rgb-xy

  let z = 1 - x - y;
  let Y = bri / 255;
  let X = 0;
  let Z = 0;

  if (y > 0) {
    X = (Y / y) * x;
    Z = (Y / y) * z;
  }

  // Invert the Wide RGB D65 formula
  let r =  X * 1.656492 - Y * 0.354851 - Z * 0.255038;
  let g = -X * 0.707196 + Y * 1.655397 + Z * 0.036152;
  let b =  X * 0.051713 - Y * 0.121364 + Z * 1.011530;

  // Invert the gamma correction
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1 / 2.4) - 0.055;

  return Color({r: 255 * r, g: 255 * g, b: 255 * b}).hex();
}

/**
 * Convert from a CSS color string to CIE xy coordinates and brightness
 * @param {string} cssColor CSS string representing color
 * @return {{xy: Array<number>, bri: number}}
 */
function cssToXYBri(cssColor) {
  let color = Color(cssColor);
  let r = color.red() / 255;
  let g = color.green() / 255;
  let b = color.blue() / 255;

  // From https://developers.meethue.com/documentation/color-conversions-rgb-xy

  // Apply gamma correction
  r = (r > 0.04045) ? Math.pow((r + 0.055) / 1.055, 2.4) : (r / 12.92);
  g = (g > 0.04045) ? Math.pow((g + 0.055) / 1.055, 2.4) : (g / 12.92);
  b = (b > 0.04045) ? Math.pow((b + 0.055) / 1.055, 2.4) : (b / 12.92);

  // Convert to XYZ using the Wide RGB D65 conversion formula
  let X = r * 0.664511 + g * 0.154324 + b * 0.162028;
  let Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
  let Z = r * 0.000088 + g * 0.072310 + b * 0.986039;

  let x = 0;
  let y = 0;

  if (X + Y + Z > 0) {
    x = X / (X + Y + Z);
    y = Y / (X + Y + Z);
  }

  return {
    xy: [x, y],
    bri: Math.round(Y * 255)
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

        let color = xyBriToCSS(light.state.xy, light.state.bri);

        this.properties.set('color',
          new PhilipsHueProperty(this, 'color', {type: 'string'}, color));
      } else {
        this.type = THING_TYPE_DIMMABLE_LIGHT;

        this.properties.set('level',
          new PhilipsHueProperty(this, 'level', {type: 'number'},
                                 light.state.bri));

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
      let color = xyBriToCSS(light.state.xy, light.state.bri);
      let colorProp = this.properties.get('color');
      if (color.toUpperCase() !== colorProp.value.toUpperCase()) {
        console.log('Update color', color, 'aka', light.state, 'from',
                    colorProp.value);
        colorProp.setCachedValue(color);
        super.notifyPropertyChanged(colorProp);
      }
    }

    if (this.properties.has('level')) {
      let levelProp = this.properties.get('level');
      if (levelProp.value !== light.state.bri) {
        levelProp.setCachedValue(light.state.bri);
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
        let {xy, bri} = cssToXYBri(this.properties.get('color').value);

        properties = {
          xy: xy,
          bri: bri
        };
        break;
      }
      case 'on': {
        properties = {
          on: this.properties.get('on').value,
        };
        // We might be turning on after changing the color/level
        if (this.properties.has('color')) {
          let {xy, bri} = cssToXYBri(this.properties.get('color').value);
          properties.xy = xy;
          properties.bri = bri;
        } else if (this.properties.has('level')) {
          let bri = this.properties.get('level').value;
          properties.bri = bri;
        }
        break;
      }
      case 'level': {
        properties = {
          bri: this.properties.get('level').value
        };
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

