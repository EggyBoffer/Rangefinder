export type DevState =
  | {
      enabled: false;
    }
  | {
      enabled: true;
      characterName: string;
      systemName: string;
      shipName: string;
      jumpCalibrationLevel: number;
    };

let devState: DevState = { enabled: false };

export function setDevState(state: DevState): void {
  devState = state;
}

export function getDevState(): DevState {
  return devState;
}
