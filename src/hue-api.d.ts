/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

declare module 'hue-api' {
  export type BridgeResponse = Result[];

  export interface Result {
    success: Success;
    error: Error;
  }

  export interface Success {
    username: string;
  }

  export interface Error {
    type: number;
    address: string;
    description: string;
  }
}
