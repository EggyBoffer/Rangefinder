import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rangefinder", {
  hidePopup: () => ipcRenderer.send("popup:hide"),
  getDevState: () => ipcRenderer.invoke("dev:getState"),

  onPopupReset: (fn: () => void) => {
    ipcRenderer.removeAllListeners("popup:reset");
    ipcRenderer.on("popup:reset", () => fn());
  },

  onPopupMode: (fn: (mode: "auto" | "manual") => void) => {
    ipcRenderer.removeAllListeners("popup:mode");
    ipcRenderer.on("popup:mode", (_e, mode) => fn(mode));
  },

  runJumpCheck: (payload: any) => ipcRenderer.invoke("jumpcheck:run", payload),
});
