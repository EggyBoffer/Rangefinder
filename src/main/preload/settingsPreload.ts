import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rangefinder", {
  hideSettings: () => ipcRenderer.send("settings:hide"),
});
