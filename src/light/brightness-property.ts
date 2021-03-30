/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Property } from 'gateway-addon';
import { LightDescription } from 'hue-light';
import { DimmableLight } from './dimmable-light';

export class BrightnessProperty extends Property<number> {
  constructor(private hueLight: DimmableLight) {
    super(hueLight, 'level', {
      '@type': 'BrightnessProperty',
      label: 'Brightness',
      type: 'integer',
      unit: 'percent',
      minimum: 0,
      maximum: 100,
    });
  }

  update(light: LightDescription): void {
    if (typeof light.state.bri === 'number') {
      this.setCachedValueAndNotify((light.state.bri / 254) * 100);
    }
  }

  async setValue(value: number): Promise<number> {
    const newValue = await super.setValue(value);
    const state = { on: true, bri: Math.round((newValue * 254) / 100) };
    await this.hueLight.sendUpdate(state);
    return newValue;
  }
}
