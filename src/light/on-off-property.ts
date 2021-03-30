/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Property } from 'gateway-addon';
import { LightDescription } from 'hue-light';
import { DimmableLight } from './dimmable-light';

export class OnOffProperty extends Property<boolean> {
  constructor(private hueLight: DimmableLight) {
    super(hueLight, 'on', {
      '@type': 'OnOffProperty',
      label: 'On/Off',
      type: 'boolean',
    });
  }

  update(light: LightDescription): void {
    if (typeof light.state.on === 'boolean') {
      this.setCachedValueAndNotify(light.state.on);
    }
  }

  async setValue(value: boolean): Promise<boolean> {
    const newValue = await super.setValue(value);
    const state = { on: newValue };
    await this.hueLight.sendUpdate(state);
    return newValue;
  }
}
