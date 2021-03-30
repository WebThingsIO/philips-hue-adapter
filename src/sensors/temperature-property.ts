/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device, Property } from 'gateway-addon';
import { SensorDescription } from 'hue-sensor';

export class TemperatureProperty extends Property<number> {
  constructor(device: Device) {
    super(device, 'temperature', {
      label: 'Temperature',
      type: 'number',
      '@type': 'TemperatureProperty',
      unit: 'degree celsius',
      readOnly: true,
      multipleOf: 0.1,
    });
  }

  update(sensor: SensorDescription): void {
    if (typeof sensor.state.temperature === 'number') {
      this.setCachedValueAndNotify(sensor.state.temperature / 100);
    }
  }
}
