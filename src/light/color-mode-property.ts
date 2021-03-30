/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Property } from 'gateway-addon';
import { LightDescription } from 'hue-light';
import { DimmableLight } from './dimmable-light';

export class ColorModeProperty extends Property<string> {
  constructor(hueLight: DimmableLight) {
    super(hueLight, 'colorMode', {
      '@type': 'ColorModeProperty',
      label: 'Color Mode',
      type: 'string',
      enum: ['color', 'temperature'],
      readOnly: true,
    });
  }

  update(light: LightDescription): void {
    if (light.state.colormode) {
      const mode = light.state.colormode === 'ct' ? 'temperature' : 'color';
      this.setCachedValueAndNotify(mode);
    }
  }
}
