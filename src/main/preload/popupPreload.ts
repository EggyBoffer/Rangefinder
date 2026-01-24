import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rangefinder", {
  hidePopup: () => ipcRenderer.send("popup:hide"),
  getDevState: () => ipcRenderer.invoke("dev:getState"),
  onPopupReset: (fn: () => void) => {
    ipcRenderer.removeAllListeners("popup:reset");
    ipcRenderer.on("popup:reset", () => fn());
  },
  setPopupMode: (mode: "input" | "result") => ipcRenderer.send("popup:mode", mode),
  onPopupMode: (fn: (mode: "input" | "result") => void) => {
    ipcRenderer.removeAllListeners("popup:mode");
    ipcRenderer.on("popup:mode", (_e, mode) => fn(mode));
  },
});
