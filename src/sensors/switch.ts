/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device } from 'gateway-addon';
import { PhilipsHueAdapter } from '../philips-hue-adapter';
import { ButtonProperty } from './button-property';
import { SensorDescription } from 'hue-sensor';
import { LastUpdatedProperty } from './last-updated-property';
import { Sensor } from './sensor';

const HUE_DIMMER_SWITCH_BUTTONS = [
  {
    name: 'buttonOn',
    label: 'On',
    codes: [1000, 1001, 1002, 1003],
  },
  {
    name: 'buttonBrighten',
    label: 'Dim up',
    codes: [2000, 2001, 2002, 2003],
  },
  {
    name: 'buttonDim',
    label: 'Dim down',
    codes: [3000, 3001, 3002, 3003],
  },
  {
    name: 'buttonOff',
    label: 'Off',
    codes: [4000, 4001, 4002, 4003],
  },
];

export class Switch extends Device implements Sensor {
  private buttons: ButtonProperty[] = [];

  private lastUpdatedProperty: LastUpdatedProperty;

  private lastUpdated?: string;

  constructor(adapter: PhilipsHueAdapter, id: string, sensor: SensorDescription) {
    super(adapter, id);
    this.setTitle(sensor.name);
    this.addType('PushButton');

    this.lastUpdatedProperty = new LastUpdatedProperty(this);

    for (const { name, label, codes } of HUE_DIMMER_SWITCH_BUTTONS) {
      const button = new ButtonProperty(this, name, label, [...codes]);
      this.buttons.push(button);
      this.addProperty(button);
    }
  }

  addType(type: string): void {
    ((this as unknown) as { '@type': string[] })['@type'].push(type);
  }

  update(sensor: SensorDescription): void {
    for (const button of this.buttons) {
      const isButton = button.hasCode(sensor.state.buttonevent ?? -1);
      const isPressed = this.lastUpdated !== sensor.state.lastupdated;
      button.setCachedValueAndNotify(isButton && isPressed);
    }

    this.lastUpdated = sensor.state.lastupdated;
    this.lastUpdatedProperty.setCachedValueAndNotify(sensor.state.lastupdated ?? 'unknown');
  }
}
