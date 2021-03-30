/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device, Property } from 'gateway-addon';
import { SensorDescription } from 'hue-sensor';

export class LightLevelProperty extends Property<number> {
  constructor(device: Device) {
    super(device, 'lightlevel', {
      '@type': 'LevelProperty',
      label: 'Light Level',
      type: 'integer',
      readOnly: true,
    });
  }

  update(sensor: SensorDescription): void {
    if (typeof sensor.state.lightlevel === 'number') {
      this.setCachedValueAndNotify(sensor.state.lightlevel);
    }
  }
}
