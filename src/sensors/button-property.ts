/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device, Property } from 'gateway-addon';

export class ButtonProperty extends Property<boolean> {
  constructor(device: Device, name: string, label: string, private codes: number[]) {
    super(device, name, {
      '@type': 'PushedProperty',
      label,
      type: 'boolean',
      readOnly: true,
    });
  }

  public hasCode(code: number): boolean {
    return this.codes.indexOf(code) > -1;
  }
}
