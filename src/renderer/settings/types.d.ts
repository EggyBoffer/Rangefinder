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
      onPopupMode?: (fn: (mode: "auto" | "manual") => void) => void;

      runJumpCheck?: (payload: {
        mode: "auto" | "manual";
        characterKey: string;
        destinationSystem: string;
        fromSystem?: string;
        shipClass?: "BLACK_OPS" | "JUMP_FREIGHTER" | "CAPITAL" | "SUPERCAP" | "RORQUAL" | "LANCER";
      }) => Promise<any>;
    };
  }
}
