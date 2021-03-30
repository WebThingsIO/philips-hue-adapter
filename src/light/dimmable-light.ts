/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device } from 'gateway-addon';
import fetch from 'node-fetch';
import { BrightnessProperty } from './brightness-property';
import { LightDescription, State } from 'hue-light';
import { OnOffProperty } from './on-off-property';
import { PhilipsHueAdapter } from '../philips-hue-adapter';
import { BridgeResponse } from 'hue-api';

export class DimmableLight extends Device {
  private onOffProperty: OnOffProperty;

  private brightnessProperty: BrightnessProperty;

  constructor(
    adapter: PhilipsHueAdapter,
    id: string,
    light: LightDescription,
    private bridgeIp: string,
    private username: string,
    private deviceId: string
  ) {
    super(adapter, id);
    this.setTitle(light.name);
    this.getTypes().push('OnOffSwitch');
    this.getTypes().push('Light');
    this.onOffProperty = new OnOffProperty(this);
    this.addProperty(this.onOffProperty);
    this.brightnessProperty = new BrightnessProperty(this);
    this.addProperty(this.brightnessProperty);
  }

  update(light: LightDescription): void {
    this.onOffProperty.update(light);
    this.brightnessProperty.update(light);
  }

  async sendUpdate(state: State): Promise<void> {
    const uri = `http://${this.bridgeIp}/api/${this.username}/lights/${this.deviceId}/state`;

    const response = await fetch(uri, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });

    const bridgeResponse: BridgeResponse = await response.json();

    for (const entry of bridgeResponse) {
      if (entry.error) {
        console.warn(`Could not set state of ${this.getId()} to: ${entry.error.description}`);
      }
    }
  }
}
