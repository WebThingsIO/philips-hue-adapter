/**
 *
 * PhilipsHueAdapter - an adapter for controlling Philips Hue lights
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const fetch = require('node-fetch');
const Color = require('color');

const {
  Adapter,
  Constants,
  Database,
  Device,
  Property,
} = require('gateway-addon');

const KNOWN_BRIDGE_USERNAMES = 'PhilipsHueAdapter.knownBridgeUsernames';

const SUPPORTED_SENSOR_TYPES = {
  Daylight: true,
  ZLLTemperature: true,
  CLIPTemperature: true,
  ZLLPresence: true,
  CLIPPresence: true,
  ZLLLightLevel: true,
  CLIPLightLevel: true,
  ZLLSwitch: true,
};

const HUE_DIMMER_SWITCH_BUTTONS = {
  buttonOn: {
    start: 1000,
    off: 1002,
    label: 'On',
  },
  buttonBrighten: {
    start: 2000,
    off: 2002,
    label: 'Dim up',
  },
  buttonDim: {
    start: 3000,
    off: 3002,
    label: 'Dim down',
  },
  buttonOff: {
    start: 4000,
    off: 4002,
    label: 'Off',
  },
};

/**
 * Property of a Hue device
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
    if (this.readOnly) {
      return Promise.reject('Read-only property');
    }

    if (this.hasOwnProperty('minimum')) {
      value = Math.max(this.minimum, value);
    }

    if (this.hasOwnProperty('maximum')) {
      value = Math.min(this.maximum, value);
    }

    if (this.type === 'integer') {
      value = Math.round(value);
    }

    const changed = this.value !== value;
    return new Promise((resolve) => {
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
    v: state.bri / 254 * 100,
  }).hex();
}

/**
 * Convert from light properties to a brightness value
 * @param {Object} state
 * @return {number} number representing brightness value
 */
function stateToLevel(state) {
  return Math.round(state.bri / 254 * 100);
}

/**
 * Convert from light properties to a color temperature value.
 * @param {Object} state
 * @return {number} number representing color temperature value
 */
function stateToColorTemperature(state) {
  return Math.round(1e6 / state.ct);
}

/**
 * Convert from a CSS color string to a light state object
 * @param {string} cssColor CSS string representing color
 * @return {Object}
 */
function cssToState(cssColor) {
  const color = Color(cssColor);

  return {
    hue: Math.round(color.hue() * 65535 / 360),
    sat: Math.round(color.saturationv() * 254 / 100),
    bri: Math.round(color.value() * 254 / 100),
  };
}

/**
 * Convert from a level value to a light state object
 * @param {number} level brightness value
 * @return {Object}
 */
function levelToState(level) {
  return {
    bri: Math.round(level * 254 / 100),
  };
}

/**
 * Convert from a color temperature value to a light state object
 * @param {number} temperature color temperature value
 * @return {Object}
 */
function colorTemperatureToState(temperature) {
  return {
    ct: Math.round(1e6 / temperature),
  };
}

/**
 * A Philips Hue light bulb
 */
class PhilipsHueDevice extends Device {
  /**
   * @param {PhilipsHueAdapter} adapter
   * @param {String} id - A globally unique identifier
   * @param {String} deviceId - id of the device expected by the bridge API
   * @param {Object} device - the device API object
   */
  constructor(adapter, id, deviceId, device) {
    super(adapter, id);

    this.deviceId = deviceId;
    this.name = device.name;

    if (deviceId.startsWith('sensors')) {
      if (device.state.hasOwnProperty('presence')) {
        this.type = Constants.THING_TYPE_BINARY_SENSOR;
        this['@type'] = ['MotionSensor'];
        this.properties.set(
          'on',
          new PhilipsHueProperty(
            this,
            'on',
            {
              '@type': 'MotionProperty',
              label: 'Present',
              type: 'boolean',
              readOnly: true,
            },
            device.state.presence));
      } else if (device.state.hasOwnProperty('temperature')) {
        this.type = Constants.THING_TYPE_UNKNOWN_THING;
        this['@type'] = ['TemperatureSensor'];
        this.properties.set(
          'temperature',
          new PhilipsHueProperty(
            this,
            'temperature',
            {
              label: 'Temperature',
              type: 'number',
              '@type': 'TemperatureProperty',
              unit: 'degree celsius',
              readOnly: true,
            },
            device.state.temperature / 100));
      } else if (device.state.hasOwnProperty('daylight')) {
        // TODO: Fill in proper types once they are implemented
        this.type = Constants.THING_TYPE_MULTI_LEVEL_SENSOR;
        this['@type'] = ['MultiLevelSensor'];
        this.properties.set(
          'daylight',
          new PhilipsHueProperty(
            this,
            'daylight',
            {
              '@type': 'BooleanProperty',
              label: 'Daylight',
              type: 'boolean',
              readOnly: true,
            },
            device.state.daylight));

        this.properties.set(
          'dark',
          new PhilipsHueProperty(
            this,
            'dark',
            {
              '@type': 'BooleanProperty',
              label: 'Dark',
              type: 'boolean',
              readOnly: true,
            },
            device.state.dark));

        this.properties.set(
          'lightlevel',
          new PhilipsHueProperty(
            this,
            'lightlevel',
            {
              '@type': 'LevelProperty',
              label: 'Light Level',
              type: 'integer',
              readOnly: true,
            },
            device.state.lightlevel));
      } else if (device.state.hasOwnProperty('buttonevent')) {
        this.type = Constants.THING_TYPE_BINARY_SENSOR;
        this['@type'] = ['PushButton'];
        if (device.type === 'ZLLSwitch') {
          for (const buttonType in HUE_DIMMER_SWITCH_BUTTONS) {
            if (HUE_DIMMER_SWITCH_BUTTONS.hasOwnProperty(buttonType)) {
              const buttonInfo = HUE_DIMMER_SWITCH_BUTTONS[buttonType];
              this.properties.set(
                buttonType,
                new PhilipsHueProperty(
                  this,
                  buttonType,
                  {
                    '@type': 'PushedProperty',
                    label: buttonInfo.label,
                    type: 'boolean',
                    readOnly: true,
                  },
                  device.state.buttonevent >= buttonInfo.start &&
                                       device.state.buttonevent < buttonInfo.off
                )
              );
            }
          }
        }
      }
    } else {
      this.type = Constants.THING_TYPE_ON_OFF_LIGHT;
      this['@type'] = ['OnOffSwitch', 'Light'];
      this.properties.set(
        'on',
        new PhilipsHueProperty(
          this,
          'on',
          {
            '@type': 'OnOffProperty',
            label: 'On/Off',
            type: 'boolean',
          },
          device.state.on));

      if (device.state.hasOwnProperty('bri')) {
        if (device.state.hasOwnProperty('xy')) {
          this.type = Constants.THING_TYPE_ON_OFF_COLOR_LIGHT;
          this['@type'].push('ColorControl');

          const color = stateToCSS(device.state);

          this.properties.set(
            'color',
            new PhilipsHueProperty(
              this,
              'color',
              {
                '@type': 'ColorProperty',
                label: 'Color',
                type: 'string',
              },
              color));
        } else {
          if (device.state.hasOwnProperty('ct')) {
            this.type = Constants.THING_TYPE_DIMMABLE_COLOR_LIGHT;
            this['@type'].push('ColorControl');

            const colorTemperature = stateToColorTemperature(device.state);

            this.properties.set(
              'colorTemperature',
              new PhilipsHueProperty(
                this,
                'colorTemperature',
                {
                  '@type': 'ColorTemperatureProperty',
                  label: 'Color Temperature',
                  type: 'integer',
                  unit: 'kelvin',
                  minimum: 2203,
                  maximum: 6536,
                },
                colorTemperature));
          } else {
            this.type = Constants.THING_TYPE_DIMMABLE_LIGHT;
          }

          const level = stateToLevel(device.state);

          this.properties.set(
            'level',
            new PhilipsHueProperty(
              this,
              'level',
              {
                '@type': 'BrightnessProperty',
                label: 'Brightness',
                type: 'integer',
                unit: 'percent',
                minimum: 0,
                maximum: 100,
              },
              level));
        }
      }
    }

    if (device.config && device.config.hasOwnProperty('battery')) {
      this.properties.set(
        'battery',
        new PhilipsHueProperty(
          this,
          'battery',
          {
            '@type': 'LevelProperty',
            label: 'Battery',
            type: 'integer',
            unit: 'percent',
            readOnly: true,
            minimum: 0,
            maximum: 100,
          },
          device.config.battery
        )
      );
    }

    this.adapter.handleDeviceAdded(this);
  }

  /**
   * Update the device based on the Hue API's view of it.
   * @param {Object} light - the light API object
   */
  update(device) {
    if (this.properties.has('on')) {
      const onProp = this.properties.get('on');
      let newValue = onProp.value;

      if (device.state.hasOwnProperty('on')) {
        newValue = device.state.on;
      } else if (device.state.hasOwnProperty('presence')) {
        newValue = device.state.presence;
      }

      if (onProp.value !== newValue) {
        onProp.setCachedValue(newValue);
        super.notifyPropertyChanged(onProp);
      }
    }

    this.copyValue(device.state, 'daylight', 'daylight');
    this.copyValue(device.state, 'dark', 'dark');
    this.copyValue(device.state, 'lightlevel', 'lightlevel');

    if (this.properties.has('color') && device.state.on) {
      const color = stateToCSS(device.state);
      const colorProp = this.properties.get('color');
      if (color.toUpperCase() !== colorProp.value.toUpperCase()) {
        colorProp.setCachedValue(color);
        super.notifyPropertyChanged(colorProp);
      }
    }

    if (this.properties.has('colorTemperature') && device.state.on) {
      const colorTemperature = stateToColorTemperature(device.state);
      const colorTemperatureProp = this.properties.get('colorTemperature');
      if (colorTemperatureProp.value !== colorTemperature) {
        colorTemperatureProp.setCachedValue(colorTemperature);
        super.notifyPropertyChanged(colorTemperatureProp);
      }
    }

    if (this.properties.has('level')) {
      const level = stateToLevel(device.state);
      const levelProp = this.properties.get('level');
      if (levelProp.value !== level) {
        levelProp.setCachedValue(level);
        super.notifyPropertyChanged(levelProp);
      }
    }

    if (this.properties.has('temperature')) {
      const temp = device.state.temperature / 100;
      const tempProp = this.properties.get('temperature');
      if (tempProp.value !== temp) {
        tempProp.setCachedValue(temp);
        super.notifyPropertyChanged(tempProp);
      }
    }

    if (this.properties.has('battery')) {
      const battery = device.config.battery;
      const batteryProp = this.properties.get('battery');
      if (batteryProp.value !== battery) {
        batteryProp.setCachedValue(battery);
        super.notifyPropertyChanged(batteryProp);
      }
    }

    if (this.properties.has('buttonOn')) {
      const buttonEvent = device.state.buttonevent;
      for (const buttonType in HUE_DIMMER_SWITCH_BUTTONS) {
        if (HUE_DIMMER_SWITCH_BUTTONS.hasOwnProperty(buttonType)) {
          const buttonInfo = HUE_DIMMER_SWITCH_BUTTONS[buttonType];
          const buttonProp = this.properties.get(buttonType);
          const pressed = buttonEvent >= buttonInfo.start &&
            buttonEvent < buttonInfo.off;
          if (buttonProp.value !== pressed) {
            buttonProp.setCachedValue(pressed);
            super.notifyPropertyChanged(buttonProp);
          }
        }
      }
    }
  }

  copyValue(state, stateName, propertyName) {
    if (this.properties.has(propertyName)) {
      const property = this.properties.get(propertyName);
      const oldValue = property.value;
      const newValue = state[stateName];

      if (oldValue !== newValue) {
        property.setCachedValue(newValue);
        super.notifyPropertyChanged(property);
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
      case 'colorTemperature': {
        properties = colorTemperatureToState(
          this.properties.get('colorTemperature').value);
        break;
      }
      case 'on': {
        properties = {};

        // We might be turning on after changing the color/level
        if (this.properties.has('color')) {
          properties = Object.assign(
            properties,
            cssToState(this.properties.get('color').value));
        }

        if (this.properties.has('colorTemperature')) {
          properties = Object.assign(
            properties,
            colorTemperatureToState(
              this.properties.get('colorTemperature').value));
        }

        if (this.properties.has('level')) {
          properties = Object.assign(
            properties,
            levelToState(this.properties.get('level').value));
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
    this.adapter.sendProperties(this.deviceId, properties);
  }
}

/**
 * Philips Hue Bridge Adapter
 * Instantiates one PhilipsHueDevice per light
 * Handles the username acquisition (pairing) process
 */
class PhilipsHueAdapter extends Adapter {
  constructor(adapterManager, packageName, bridgeId, bridgeIp) {
    super(adapterManager, `philips-hue-${bridgeId}`, packageName);

    this.username = null;
    this.bridgeId = bridgeId;
    this.bridgeIp = bridgeIp;
    this.pairing = false;
    this.pairingEnd = 0;
    this.updateDevices = this.updateDevices.bind(this);
    this.updateInterval = 1000;
    this.scheduledUpdate = null;

    adapterManager.addAdapter(this);

    this.getKnownBridgeUsernames().then((knownBridgeUsernames) => {
      if (!knownBridgeUsernames) {
        return Promise.reject('no known bridges');
      }

      let username = null;
      for (const elt of knownBridgeUsernames) {
        if (elt.id === this.bridgeId) {
          username = elt.username;
          break;
        }
      }
      if (!username) {
        return Promise.reject('no known username');
      }
      this.username = username;
      this.updateDevices();
    }).catch((e) => {
      console.error(e);
    });
  }

  /**
   * Migrate usernames from node-persist to gateway storage
   * Should be removed in 0.7.1
   */
  async migrate() {
    const db = new Database(this.packageName);
    await db.open();
    const config = await db.loadConfig();
    if (config.usernames.length > 0) {
      // Database has already been migrated
      return;
    }
    const storage = require('node-persist');
    await storage.init();
    const current = await storage.getItem(KNOWN_BRIDGE_USERNAMES);
    const usernames = [];
    for (const id in current) {
      usernames.push({
        id: id,
        username: current[id],
      });
    }

    await db.saveConfig({
      usernames: usernames,
    });
  }

  /**
   * @return {Array} bridge usernames as an array of id and username pairs
   */
  async getKnownBridgeUsernames() {
    await this.migrate();
    const db = new Database(this.packageName);
    await db.open();
    const config = await db.loadConfig();
    return config.usernames || {};
  }

  /**
   * @param {Array} bridge usernames as an array of id and username pairs
   */
  async setKnownBridgeUsernames(usernames) {
    const db = new Database(this.packageName);
    await db.open();
    await db.saveConfig({
      usernames: usernames,
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
    this.pair().then((username) => {
      this.username = username;
      return this.updateDevices();
    }).then(() => {
      return this.getKnownBridgeUsernames();
    }).then((knownBridgeUsernames) => {
      if (!knownBridgeUsernames) {
        knownBridgeUsernames = [];
      }
      let updated = false;
      for (let i = 0; i < knownBridgeUsernames.length; i++) {
        const elt = knownBridgeUsernames[i];
        if (elt.id === this.bridgeId) {
          elt.username = this.username;
          updated = true;
          break;
        }
      }
      if (!updated) {
        knownBridgeUsernames.push({
          id: this.bridgeId,
          username: this.username,
        });
      }
      return this.setKnownBridgeUsernames(knownBridgeUsernames);
    }).catch((e) => {
      console.error(e);
      if (this.pairing && Date.now() < this.pairingEnd) {
        // Attempt pairing again later
        setTimeout(this.attemptPairing.bind(this), 500);
      }
    });
  }

  /**
   * Perform a single attempt at pairing with a Hue hub
   * @return {Promise} Resolved with username if pairing succeed
   * });
   */
  pair() {
    if (this.username) {
      return Promise.resolve(this.username);
    }

    return fetch(`http://${this.bridgeIp}/api`, {
      method: 'POST',
      body: '{"devicetype":"mozilla_gateway#PhilipsHueAdapter"}',
    }).then((replyRaw) => {
      return replyRaw.json();
    }).then((reply) => {
      if (reply.length === 0) {
        return Promise.reject('empty response from bridge');
      }

      const msg = reply[0];
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
   * Updates devices known to bridge, instantiating one PhilipsHueDevice per
   * light or updating the existing PhilipsHueDevice
   * @return {Promise}
   */
  updateDevices() {
    if (!this.username) {
      return Promise.reject('missing username');
    }

    const apiBase = `http://${this.bridgeIp}/api/${this.username}`;
    return Promise.all([
      fetch(`${apiBase}/lights`).then(function(response) {
        if (response.status == 404) {
          return new fetch.Response('[]', {status: '200'});
        }
        return response;
      }),
      fetch(`${apiBase}/sensors`).then(function(response) {
        if (response.status == 404) {
          return new fetch.Response('[]', {status: '200'});
        }
        return response;
      }),
    ]).then((responses) => {
      return Promise.all(responses.map((res) => res.json()));
    }).then(([lights, sensors]) => {
      // TODO(hobinjk): dynamically remove lights
      for (const lightId in lights) {
        const state = lights[lightId];
        const deviceId = `lights/${lightId}`;
        this.updateDevice(deviceId, state);
      }
      for (const sensorId in sensors) {
        const state = sensors[sensorId];
        const deviceId = `sensors/${sensorId}`;
        this.updateDevice(deviceId, state);
      }


      if (this.scheduledUpdate) {
        clearTimeout(this.scheduledUpdate);
      }
      this.scheduledUpdate = setTimeout(this.updateDevices,
                                        this.updateInterval);
    }).catch((e) => {
      console.warn('Error updating devices', e);
      if (this.scheduledUpdate) {
        clearTimeout(this.scheduledUpdate);
      }
      this.scheduledUpdate = setTimeout(this.updateDevices,
                                        this.updateInterval);
    });
  }

  updateDevice(deviceId, deviceState) {
    if (deviceId.startsWith('sensors')) {
      if (!SUPPORTED_SENSOR_TYPES[deviceState.type]) {
        return;
      }
    }
    const normalizedId = deviceId.replace(/lights\//g, '')
      .replace(/\//g, '-');
    const id = `philips-hue-${this.bridgeId}-${normalizedId}`;

    const device = this.devices[id];
    if (device) {
      if (device.recentlyUpdated) {
        // Skip the next update after a sendProperty
        device.recentlyUpdated = false;
        return;
      }

      device.update(deviceState);
      return;
    }

    new PhilipsHueDevice(this, id, deviceId, deviceState);
  }

  /**
   * Communicate the state of a device to the bridge
   * @param {String} deviceId - Id of device usually in format lights/1
   * @param {Object} properties - Updated properties of device to be sent
   * @return {Promise}
   */
  sendProperties(deviceId, properties) {
    const uri =
      `http://${this.bridgeIp}/api/${this.username}/${deviceId}/state`;

    // Skip the next update after a sendProperty
    if (this.devices[deviceId]) {
      this.devices[deviceId].recentlyUpdated = true;
    }

    return fetch(uri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(properties),
    }).then((res) => {
      return res.text();
    }).catch((e) => {
      console.error(e);
    });
  }
}

module.exports = PhilipsHueAdapter;
