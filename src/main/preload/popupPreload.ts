import { contextBridge, ipcRenderer } from "electron";

type JumpShipClass = "BLACK_OPS" | "JUMP_FREIGHTER" | "CAPITAL" | "SUPERCAP" | "RORQUAL" | "LANCER";

contextBridge.exposeInMainWorld("rangefinder", {
  hidePopup: () => ipcRenderer.send("popup:hide"),
  hideSettings: () => ipcRenderer.send("settings:hide"),

  getDevState: () => ipcRenderer.invoke("dev:getState"),

  runJumpCheck: (payload: {
    mode: "auto" | "manual";
    characterKey: string;
    destinationSystem: string;
    fromSystem?: string;
    shipClass?: JumpShipClass;
  }) => ipcRenderer.invoke("jumpcheck:run", payload),

  setResultMode: (on: boolean) => ipcRenderer.send("popup:setResultMode", !!on),

  onPopupReset: (cb: () => void) => {
    ipcRenderer.removeAllListeners("popup:reset");
    ipcRenderer.on("popup:reset", () => cb());
  },

  onPopupMode: (cb: (mode: "auto" | "manual") => void) => {
    ipcRenderer.removeAllListeners("popup:mode");
    ipcRenderer.on("popup:mode", (_e, mode) => cb(mode));
  },

  resolveSystem: (name: string) => ipcRenderer.invoke("universe:resolveSystem", name),

  ping: () => ipcRenderer.invoke("debug:ping"),
});
