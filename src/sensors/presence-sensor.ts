/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { Device } from 'gateway-addon';
import { PhilipsHueAdapter } from '../philips-hue-adapter';
import { BatteryProperty } from './battery-property';
import { DarkProperty } from './dark-property';
import { DaylightProperty } from './daylight-property';
import { SensorDescription, SensorDescriptions } from 'hue-sensor';
import { LightLevelProperty } from './light-level-property';
import { PresenceProperty } from './presence-property';
import { Sensor } from './sensor';
import { SensorProperty } from './sensor-property';
import { TemperatureProperty } from './temperature-property';

export class PresenceSensor extends Device implements Sensor {
  private presenceProperty: PresenceProperty;

  private batteryProperty: BatteryProperty;

  private subDeviceProperties: Record<string, SensorProperty[]> = {};

  constructor(
    adapter: PhilipsHueAdapter,
    id: string,
    sensor: SensorDescription,
    sensors: SensorDescriptions
  ) {
    super(adapter, id);
    this.setTitle(sensor.name);
    this.addType('MotionSensor');
    this.presenceProperty = new PresenceProperty(this);
    this.addProperty(this.presenceProperty);
    this.batteryProperty = new BatteryProperty(this);
    this.addProperty(this.batteryProperty);

    const [primaryId] = sensor.uniqueid.split('-');

    const types = new Set<string>();

    for (const [id, description] of Object.entries(sensors)) {
      if (description.uniqueid?.startsWith(primaryId)) {
        switch (description.type) {
          case 'CLIPLightLevel':
          case 'ZLLLightLevel': {
            types.add('MultiLevelSensor');
            const lightLevelProperty = new LightLevelProperty(this);
            this.addProperty(lightLevelProperty);
            /* eslint-disable max-len */
            console.log(
              `Added ${lightLevelProperty.constructor.name} from subdevice ${id} to ${
                description.name
              } (${this.getId()})`
            );

            const darkProperty = new DarkProperty(this);
            this.addProperty(darkProperty);
            /* eslint-disable max-len */
            console.log(
              `Added ${darkProperty.constructor.name} from subdevice ${id} to ${
                description.name
              } (${this.getId()})`
            );

            const daylightProperty = new DaylightProperty(this);
            this.addProperty(daylightProperty);
            /* eslint-disable max-len */
            console.log(
              `Added ${daylightProperty.constructor.name} from subdevice ${id} to ${
                description.name
              } (${this.getId()})`
            );

            this.subDeviceProperties[id] = [lightLevelProperty, darkProperty, daylightProperty];
            break;
          }
          case 'CLIPTemperature':
          case 'ZLLTemperature': {
            types.add('TemperatureSensor');
            const temperatureProperty = new TemperatureProperty(this);
            this.addProperty(temperatureProperty);
            console.log(
              `Added ${temperatureProperty.constructor.name} from subdevice ${id} to ${
                description.name
              } (${this.getId()})`
            );
            this.subDeviceProperties[id] = [temperatureProperty];
            break;
          }
        }
      }
    }

    for (const type of types.keys()) {
      this.addType(type);
    }
  }

  addType(type: string): void {
    ((this as unknown) as { '@type': string[] })['@type'].push(type);
  }

  update(sensor: SensorDescription, sensors: SensorDescriptions): void {
    this.presenceProperty.update(sensor);
    this.batteryProperty.update(sensor);

    for (const [id, description] of Object.entries(sensors)) {
      const subDeviceProperty = this.subDeviceProperties[id];
      subDeviceProperty?.forEach((property) => property.update(description));
    }
  }
}
