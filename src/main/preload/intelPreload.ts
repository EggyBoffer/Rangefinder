import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rangefinder", {
  hideIntel: () => ipcRenderer.send("intel:hide"),
  intelLookupCharacter: (name: string) => ipcRenderer.invoke("intel:lookupCharacter", name),
  intelGetKillmailEnriched: (killmailId: number, killmailHash: string, characterId: number) =>
    ipcRenderer.invoke("intel:getKillmailEnriched", killmailId, killmailHash, characterId),

  openExternal: (url: string) => ipcRenderer.invoke("shell:openExternal", url),

  // ✅ reliable clipboard bridge (fixes Copy summary failing in overlay windows)
  writeClipboardText: (text: string) => ipcRenderer.invoke("clipboard:writeText", text),

  onIntelReset: (cb: () => void) => {
    ipcRenderer.removeAllListeners("intel:reset");
    ipcRenderer.on("intel:reset", () => cb());
  },
});