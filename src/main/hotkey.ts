import { app, globalShortcut } from "electron";
import { togglePopupWindow, hidePopupWindow } from "./windows/popupWindow";

export function registerHotkeys(): void {
  globalShortcut.register("Control+Shift+J", () => togglePopupWindow("auto"));
  globalShortcut.register("Control+Shift+P", () => togglePopupWindow("manual"));
  globalShortcut.register("Control+Shift+K", () => hidePopupWindow());

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });
}
