import { Tray, Menu, nativeImage, app } from "electron";
import * as path from "path";
import { showSettingsWindow } from "./windows/settingsWindow";
import { showPopupWindow } from "./windows/popupWindow";

let tray: Tray | null = null;

export function createTray(): Tray {
  if (tray) return tray;

  const iconPath = path.join(app.getAppPath(), "assets", "icons", "tray.png");
  const img = nativeImage.createFromPath(iconPath);

  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip("EVE Jump Tracker");

  const menu = Menu.buildFromTemplate([
    { label: "Open Settings", click: () => showSettingsWindow() },
    { label: "Jump Check (Ctrl+Shift+J)", click: () => showPopupWindow() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);

  // Left click: show popup (fast workflow)
  tray.on("click", () => showPopupWindow());

  return tray;
}
