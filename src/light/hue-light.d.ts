/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare module 'hue-light' {
  export interface ApiResponse {
    lights: LightDescriptions;
  }

  export type LightDescriptions = Record<string, LightDescription>;

  export interface LightDescription {
    state: State;
    swupdate: Swupdate;
    type: string;
    name: string;
    modelid: string;
    manufacturername: string;
    productname: string;
    capabilities: Capabilities;
    config: Config;
    uniqueid: string;
    swversion: string;
    swconfigid: string;
    productid: string;
  }

  export interface State {
    on?: boolean;
    bri?: number;
    hue?: number;
    sat?: number;
    effect?: string;
    xy?: number[];
    ct?: number;
    alert?: string;
    colormode?: string;
    mode?: string;
    reachable?: boolean;
  }

  export interface Swupdate {
    state: string;
    lastinstall: Date;
  }

  export interface Capabilities {
    certified: boolean;
    control: Control;
    streaming: Streaming;
  }

  export interface Control {
    mindimlevel: number;
    maxlumen: number;
    colorgamuttype: string;
    colorgamut: number[][];
    ct: Ct;
  }

  export interface Ct {
    min: number;
    max: number;
  }

  export interface Streaming {
    renderer: boolean;
    proxy: boolean;
  }

  export interface Config {
    archetype: string;
    function: string;
    direction: string;
    startup: Startup;
  }

  export interface Startup {
    mode: string;
    configured: boolean;
  }
}
