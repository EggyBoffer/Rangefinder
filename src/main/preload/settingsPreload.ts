import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rangefinder", {
  hideSettings: () => ipcRenderer.send("settings:hide"),

  getHotkeys: () => ipcRenderer.invoke("config:getHotkeys"),
  setHotkeys: (hotkeys: { popupAuto: string; popupManual: string; hidePopup: string; intelSearch: string }) =>
    ipcRenderer.invoke("config:setHotkeys", hotkeys),
  resetHotkeys: () => ipcRenderer.invoke("config:resetHotkeys"),

  getMaxGateJumpsToCheck: () => ipcRenderer.invoke("config:getMaxGateJumpsToCheck"),
  setMaxGateJumpsToCheck: (v: number) => ipcRenderer.invoke("config:setMaxGateJumpsToCheck", v),

  esiListCharacters: () => ipcRenderer.invoke("esi:listCharacters"),
  esiGetActiveCharacterId: () => ipcRenderer.invoke("esi:getActiveCharacterId"),
  esiSetActiveCharacterId: (id: number) => ipcRenderer.invoke("esi:setActiveCharacterId", id),
  esiAddCharacter: () => ipcRenderer.invoke("esi:addCharacter"),
  esiRemoveCharacter: (id: number) => ipcRenderer.invoke("esi:removeCharacter", id),
});