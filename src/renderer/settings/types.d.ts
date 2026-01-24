export {};

declare global {
  interface Window {
    rangefinder?: {
      hideSettings?: () => void;
      hidePopup?: () => void;
      getDevState?: () => Promise<
        | { enabled: false }
        | {
            enabled: true;
            characterName: string;
            systemName: string;
            shipName: string;
            jumpCalibrationLevel: number;
          }
      >;
      onPopupReset?: (fn: () => void) => void;
      setPopupMode?: (mode: "input" | "result") => void;
      onPopupMode?: (fn: (mode: "input" | "result") => void) => void;
    };
  }
}
