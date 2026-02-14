export {};

declare global {
  interface Window {
    rangefinder?: {
      hideSettings?: () => void;

      getHotkeys?: () => Promise<{ popupAuto: string; popupManual: string; hidePopup: string; intelSearch: string }>;
      setHotkeys?: (hotkeys: { popupAuto: string; popupManual: string; hidePopup: string; intelSearch: string }) => Promise<
        { ok: true } | { ok: false; error: string }
      >;
      resetHotkeys?: () => Promise<{ ok: true } | { ok: false; error: string }>;

      getMaxGateJumpsToCheck?: () => Promise<number>;
      setMaxGateJumpsToCheck?: (v: number) => Promise<{ ok: true; value: number } | { ok: false; error: string }>;

      esiListCharacters?: () => Promise<{
        characters: {
          characterId: number;
          characterName: string;
          expiresAt: number;
          updatedAt: number;
        }[];
        activeCharacterId: number | null;
      }>;

      esiGetActiveCharacterId?: () => Promise<number | null>;
      esiSetActiveCharacterId?: (id: number) => Promise<number | null>;

      esiAddCharacter?: () => Promise<{ ok: boolean; error?: string; store?: any }>;
      esiRemoveCharacter?: (id: number) => Promise<any>;
    };
  }
}