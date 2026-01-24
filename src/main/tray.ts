import { Tray, Menu, nativeImage, app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { showSettingsWindow } from "./windows/settingsWindow";
import { showPopupWindow } from "./windows/popupWindow";

let tray: Tray | null = null;

function resolveTrayIconPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "assets", "icons", "tray.png"),
    path.join(app.getAppPath(), "assets", "icons", "tray.png"),
    path.join(path.dirname(app.getPath("exe")), "assets", "icons", "tray.png"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

export function createTray(): Tray {
  if (tray) return tray;

  const iconPath = resolveTrayIconPath();
  const img = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();

  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip("Rangefinder");

  const menu = Menu.buildFromTemplate([
    { label: "Open Settings", click: () => showSettingsWindow() },
    { label: "Jump Check (Ctrl+Shift+J)", click: () => showPopupWindow("auto") },
    { label: "Manual Planner (Ctrl+Shift+P)", click: () => showPopupWindow("manual") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  const pop = () => tray?.popUpContextMenu(menu);

  tray.on("click", () => pop());
  tray.on("right-click", () => pop());
  tray.on("double-click", () => showPopupWindow("auto"));

  return tray;
}
