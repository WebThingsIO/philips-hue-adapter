/**
 *
 * PhilipsHueAdapter - an adapter for controlling Philips Hue lights
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import fetch from 'node-fetch';

import { Adapter, AddonManagerProxy, Database, Device } from 'gateway-addon';
import { Config } from './config';
import { LightDescriptions } from 'hue-light';
import { DimmableLight } from './light/dimmable-light';
import { ColorTemperatureLight } from './light/color-temperature-light';
import { ColorLight } from './light/color-light';
import { SensorDescriptions } from 'hue-sensor';
import { PresenceSensor } from './sensors/presence-sensor';
import { Switch } from './sensors/switch';
import { Sensor } from './sensors/sensor';
import { BridgeResponse } from 'hue-api';

/* eslint-disable @typescript-eslint/no-var-requires */
const manifest = require('../manifest.json');

export class PhilipsHueAdapter extends Adapter {
  private pairing = false;

  private username: string | undefined;

  private lights: Record<string, DimmableLight> = {};

  private sensors: Record<string, Device & Sensor> = {};

  private unknownTypes: string[] = [];

  constructor(addonManager: AddonManagerProxy, private bridgeId: string, private bridgeIp: string) {
    super(addonManager, `philips-hue-${bridgeId}`, manifest.id);

    addonManager.addAdapter(this);
    this.init();
  }

  private async init(): Promise<void> {
    console.log(`Starting update loop for ${this.bridgeId}`);
    this.username = await this.getUsername(this.bridgeId);

    if (!this.username) {
      console.warn(`No username for ${this.bridgeId} present, please press link button`);
    }

    setTimeout(() => this.updateDevices(), 1000);
  }

  private async updateDevices(): Promise<void> {
    await this.updateLights();
    await this.updateSensors();
    setTimeout(() => this.updateDevices(), 1000);
  }

  private async updateLights(): Promise<void> {
    if (this.username) {
      try {
        const response = await fetch(`http://${this.bridgeIp}/api/${this.username}/lights`);
        const lights = (await response.json()) as LightDescriptions;

        if (typeof lights === 'object') {
          for (const [id, description] of Object.entries(lights)) {
            const deviceId = `philips-hue-${this.bridgeId}-${id}`;
            let light = this.lights[id];

            if (!light) {
              switch (description.type) {
                case 'Dimmable light':
                  light = new DimmableLight(
                    this,
                    deviceId,
                    description,
                    this.bridgeIp,
                    this.username,
                    id
                  );
                  break;
                case 'Color temperature light':
                  light = new ColorTemperatureLight(
                    this,
                    deviceId,
                    description,
                    this.bridgeIp,
                    this.username,
                    id
                  );
                  break;
                case 'Extended color light':
                  light = new ColorLight(
                    this,
                    deviceId,
                    description,
                    this.bridgeIp,
                    this.username,
                    id
                  );
                  break;
                default:
                  console.log(`Unknown light type ${description.type}`);
                  light = new DimmableLight(
                    this,
                    deviceId,
                    description,
                    this.bridgeIp,
                    this.username,
                    id
                  );
                  break;
              }

              /* eslint-disable max-len */
              console.log(
                `Created new ${light.constructor.name} ${description.name} (${deviceId}) from bridge ${this.bridgeId}`
              );

              this.lights[id] = light;
              this.handleDeviceAdded(light);
            }

            light.update(description);
          }
        } else {
          console.warn(`Expected 'lights' to be of type object but was ${typeof lights}`);
        }
      } catch (e) {
        console.warn(`Could not update devices: ${e}`);
      }
    }
  }

  private async updateSensors(): Promise<void> {
    if (this.username) {
      try {
        const response = await fetch(`http://${this.bridgeIp}/api/${this.username}/sensors`);
        const sensors = (await response.json()) as SensorDescriptions;

        if (typeof sensors === 'object') {
          for (const [id, description] of Object.entries(sensors)) {
            if (description.capabilities?.primary === true) {
              const deviceId = `philips-hue-${this.bridgeId}-sensors-${id}`;
              let sensor: Device & Sensor = this.sensors[id];

              if (!sensor) {
                switch (description.type) {
                  case 'CLIPPresence':
                  case 'ZLLPresence':
                    sensor = new PresenceSensor(this, deviceId, description, sensors);
                    break;
                  case 'ZLLSwitch':
                    sensor = new Switch(this, deviceId, description);
                    break;
                  default:
                    if (this.unknownTypes.indexOf(description.type) == -1) {
                      console.log(`Unknown sensor type ${description.type}`);
                      this.unknownTypes.push(description.type);
                    }
                    break;
                }

                if (sensor) {
                  /* eslint-disable max-len */
                  console.log(
                    `Created new ${sensor.constructor.name} ${description.name} (${deviceId}) from bridge ${this.bridgeId}`
                  );

                  this.sensors[id] = sensor;
                  this.handleDeviceAdded(sensor);
                  sensor.update(description, sensors);
                }
              } else {
                sensor.update(description, sensors);
              }
            }
          }
        } else {
          console.warn(`Expected 'sensors' to be of type object but was ${typeof sensors}`);
        }
      } catch (e) {
        console.warn(`Could not update sensor: ${e}`);
      }
    }
  }

  /**
   * If we don't have a username try to acquire one from the bridge
   * @param {number} timeoutSeconds
   */
  startPairing(timeoutSeconds: number): void {
    this.attemptPairing(timeoutSeconds);
  }

  private async attemptPairing(timeoutSeconds: number): Promise<void> {
    this.pairing = true;
    const pairingEnd = Date.now() + timeoutSeconds * 1000;

    while (!this.username && this.pairing && Date.now() < pairingEnd) {
      try {
        this.username = await this.pair();
        await this.setUsername(this.username);
      } catch (e) {
        console.log(`Could not pair hue bridge: ${e}`);
      }

      await new Promise<void>((resolve) => setTimeout(() => resolve(), 1000));
    }
  }

  /**
   * Perform a single attempt at pairing with a Hue hub
   * @return {Promise} Resolved with username if pairing succeed
   * });
   */
  private async pair(): Promise<string> {
    const response = await fetch(`http://${this.bridgeIp}/api`, {
      method: 'POST',
      body: JSON.stringify({ devicetype: 'mozilla_gateway#PhilipsHueAdapter' }),
    });

    const bridgeResponse: BridgeResponse = await response.json();

    if (bridgeResponse.length < 1) {
      throw new Error('Empty response from bridge');
    }

    const [{ success, error }] = bridgeResponse;

    if (error) {
      throw new Error(`Bridge error: ${error.description}`);
    }

    if (!success) {
      throw new Error(`No 'success' property found in ${JSON.stringify(bridgeResponse)}`);
    }

    if (!success.username) {
      throw new Error(`No 'username' property found in ${JSON.stringify(bridgeResponse)}`);
    }

    return success.username;
  }

  private async setUsername(username: string): Promise<void> {
    const db = new Database(manifest.id);
    await db.open();
    const config: Config = (await db.loadConfig()) ?? {};

    if (!Array.isArray(config.usernames)) {
      config.usernames = [];
    }

    let exists = false;

    for (const userName of config.usernames) {
      if (userName.id === this.bridgeId) {
        userName.username = username;
        exists = true;
        break;
      }
    }

    if (!exists) {
      config.usernames.push({ id: this.bridgeId, username });
    }

    await db.saveConfig(config);
  }

  private async getUsername(bridgeId: string): Promise<string | undefined> {
    const { usernames } = await this.getConfig();

    if (Array.isArray(usernames)) {
      for (const userName of usernames) {
        if (userName.id === bridgeId) {
          return userName.username;
        }
      }
    }

    /* eslint-disable no-useless-return */
    return;
  }

  private async getConfig(): Promise<Config> {
    const db = new Database(manifest.id);
    await db.open();
    return (await db.loadConfig()) ?? {};
  }

  cancelPairing(): void {
    this.pairing = false;
  }
}
