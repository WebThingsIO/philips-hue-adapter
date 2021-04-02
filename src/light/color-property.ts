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
    const { bri, xy } = light.state;

    if (typeof bri == 'number' && Array.isArray(xy)) {
      const [x, y] = xy;

      const rgb = xyBriToRgb(x, y, (bri as number) ?? 255);
      const color = new Color(rgb);
      this.setCachedValueAndNotify(color.hex());
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

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/*
I tried

Color({
  x: value.x * 100,
  y: value.y * 100,
  z: ((update.brightness as number) ?? 255) * 100 / 255,
}).hex()

but it seems to calculate the wrong color.
*/
// https://stackoverflow.com/questions/22894498/philips-hue-convert-xy-from-api-to-hex-or-rgb
function xyBriToRgb(x: number, y: number, bri: number): RGB {
  const z = 1.0 - x - y;

  const Y = bri / 255.0;
  const X = (Y / y) * x;
  const Z = (Y / y) * z;

  let r = X * 1.612 - Y * 0.203 - Z * 0.302;
  let g = -X * 0.509 + Y * 1.412 + Z * 0.066;
  let b = X * 0.026 - Y * 0.072 + Z * 0.962;

  r = r <= 0.0031308 ? 12.92 * r : (1.0 + 0.055) * Math.pow(r, 1.0 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : (1.0 + 0.055) * Math.pow(g, 1.0 / 2.4) - 0.055;
  b = b <= 0.0031308 ? 12.92 * b : (1.0 + 0.055) * Math.pow(b, 1.0 / 2.4) - 0.055;

  const maxValue = Math.max(r, g, b);

  r /= maxValue;
  g /= maxValue;
  b /= maxValue;

  r = limit(r * 255, 0, 255);
  g = limit(g * 255, 0, 255);
  b = limit(b * 255, 0, 255);

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function limit(value: number, min: number, max: number): number {
  return Math.max(Math.min(value, max), min);
}
