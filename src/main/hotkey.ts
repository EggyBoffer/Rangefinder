import { app, globalShortcut } from "electron";
import { showPopupWindow } from "./windows/popupWindow";

export function registerHotkeys(): void {
  const ok = globalShortcut.register("Control+Shift+J", () => {
    showPopupWindow();
  });

  if (!ok) {
    console.warn("⚠️ Failed to register hotkey Control+Shift+J (already in use?)");
  }

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
}
