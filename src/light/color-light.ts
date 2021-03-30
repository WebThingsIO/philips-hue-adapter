/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { ColorModeProperty } from './color-mode-property';
import { ColorProperty } from './color-property';
import { ColorTemperatureLight } from './color-temperature-light';
import { LightDescription } from 'hue-light';
import { PhilipsHueAdapter } from '../philips-hue-adapter';

export class ColorLight extends ColorTemperatureLight {
  private colorProperty: ColorProperty;

  private colorModeProperty: ColorModeProperty;

  constructor(
    adapter: PhilipsHueAdapter,
    id: string,
    light: LightDescription,
    bridgeIp: string,
    username: string,
    deviceId: string
  ) {
    super(adapter, id, light, bridgeIp, username, deviceId);
    this.colorProperty = new ColorProperty(this);
    this.addProperty(this.colorProperty);
    this.colorModeProperty = new ColorModeProperty(this);
    this.addProperty(this.colorModeProperty);
  }

  update(light: LightDescription): void {
    super.update(light);
    this.colorProperty.update(light);
    this.colorModeProperty.update(light);
  }
}
