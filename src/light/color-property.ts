/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import Color from 'color';
import { Property } from 'gateway-addon';
import { LightDescription } from 'hue-light';
import { DimmableLight } from './dimmable-light';

export class ColorProperty extends Property<string> {
  constructor(private hueLight: DimmableLight) {
    super(hueLight, 'color', {
      '@type': 'ColorProperty',
      label: 'Color',
      type: 'string',
    });
  }

  update(light: LightDescription): void {
    const { hue, sat, bri } = light.state;

    if (typeof hue === 'number' && typeof sat === 'number' && typeof bri === 'number') {
      const color = Color({
        h: (hue / 65535) * 360,
        s: (sat / 254) * 100,
        v: (bri / 254) * 100,
      }).hex();

      this.setCachedValueAndNotify(color);
    }
  }

  async setValue(value: string): Promise<string> {
    const newValue = await super.setValue(value);

    const color = Color(newValue);

    const state = {
      on: true,
      hue: Math.round((color.hue() * 65535) / 360),
      sat: Math.round((color.saturationv() * 254) / 100),
      bri: Math.round((color.value() * 254) / 100),
    };

    await this.hueLight.sendUpdate(state);
    return newValue;
  }
}
