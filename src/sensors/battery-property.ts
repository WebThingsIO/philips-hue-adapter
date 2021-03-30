/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device, Property } from 'gateway-addon';
import { SensorDescription } from 'hue-sensor';

export class BatteryProperty extends Property<number> {
  constructor(device: Device) {
    super(device, 'battery', {
      '@type': 'LevelProperty',
      label: 'Battery',
      type: 'integer',
      unit: 'percent',
      readOnly: true,
      minimum: 0,
      maximum: 100,
    });
  }

  update(sensor: SensorDescription): void {
    if (typeof sensor.config.battery === 'number') {
      this.setCachedValueAndNotify(sensor.config.battery);
    }
  }
}
