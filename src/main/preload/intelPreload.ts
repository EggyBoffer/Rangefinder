import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("rangefinder", {
  hideIntel: () => ipcRenderer.send("intel:hide"),
  intelLookupCharacter: (name: string) => ipcRenderer.invoke("intel:lookupCharacter", name),
  intelGetKillmailEnriched: (killmailId: number, killmailHash: string, characterId: number) =>
    ipcRenderer.invoke("intel:getKillmailEnriched", killmailId, killmailHash, characterId),
  onIntelReset: (cb: () => void) => {
    ipcRenderer.removeAllListeners("intel:reset");
    ipcRenderer.on("intel:reset", () => cb());
  },
});
