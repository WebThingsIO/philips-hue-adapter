/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare module 'hue-sensor' {
  export type SensorDescriptions = Record<string, SensorDescription>;

  export interface SensorDescription {
    state: State;
    swupdate: Swupdate;
    config: Config;
    name: string;
    type: string;
    modelid: string;
    manufacturername: string;
    productname: string;
    diversityid: string;
    swversion: string;
    uniqueid: string;
    capabilities: Capabilities;
  }

  export interface State {
    buttonevent?: number;

    temperature?: number;

    presence?: boolean;

    lightlevel?: number;
    dark?: boolean;
    daylight?: boolean;

    lastupdated?: string;
  }

  export interface Swupdate {
    state: string;
    lastinstall: string;
  }

  export interface Config {
    on: boolean;
    battery: number;
    reachable: boolean;
    pending: unknown[];
  }

  export interface Capabilities {
    certified: boolean;
    primary: boolean;
    inputs: Input[];
  }

  export interface Input {
    repeatintervals: number[];
    events: Event[];
  }

  export interface Event {
    buttonevent: number;
    eventtype: string;
  }
}
