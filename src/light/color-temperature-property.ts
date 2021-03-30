/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Property } from 'gateway-addon';
import { LightDescription } from 'hue-light';
import { DimmableLight } from './dimmable-light';

export class ColorTemperatureProperty extends Property<number> {
  constructor(private hueLight: DimmableLight) {
    super(hueLight, 'colorTemperature', {
      '@type': 'ColorTemperatureProperty',
      label: 'Color Temperature',
      type: 'integer',
      unit: 'kelvin',
      minimum: 2203,
      maximum: 6536,
    });
  }

  update(light: LightDescription): void {
    if (light.state.ct) {
      this.setCachedValueAndNotify(Math.round(1e6 / light.state.ct));
    }
  }

  async setValue(value: number): Promise<number> {
    const newValue = await super.setValue(value);
    const state = { on: true, ct: Math.round(1e6 / newValue) };
    await this.hueLight.sendUpdate(state);
    return newValue;
  }
}
