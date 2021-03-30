/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device, Property } from 'gateway-addon';
import { SensorDescription } from 'hue-sensor';

export class DarkProperty extends Property<boolean> {
  constructor(device: Device) {
    super(device, 'dark', {
      '@type': 'BooleanProperty',
      label: 'Dark',
      type: 'boolean',
      readOnly: true,
    });
  }

  update(sensor: SensorDescription): void {
    if (typeof sensor.state.dark === 'boolean') {
      this.setCachedValueAndNotify(sensor.state.dark);
    }
  }
}
