/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ColorTemperatureProperty } from './color-temperature-property';
import { DimmableLight } from './dimmable-light';
import { LightDescription } from 'hue-light';
import { PhilipsHueAdapter } from '../philips-hue-adapter';

export class ColorTemperatureLight extends DimmableLight {
  private colorTemperatureProperty: ColorTemperatureProperty;

  constructor(
    adapter: PhilipsHueAdapter,
    id: string,
    light: LightDescription,
    bridgeIp: string,
    username: string,
    deviceId: string
  ) {
    super(adapter, id, light, bridgeIp, username, deviceId);
    this.addType('ColorControl');
    this.colorTemperatureProperty = new ColorTemperatureProperty(this);
    this.addProperty(this.colorTemperatureProperty);
  }

  update(light: LightDescription): void {
    super.update(light);
    this.colorTemperatureProperty.update(light);
  }
}
