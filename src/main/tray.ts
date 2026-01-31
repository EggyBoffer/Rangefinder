import { Tray, Menu, nativeImage, app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { showSettingsWindow } from "./windows/settingsWindow";
import { showPopupWindow } from "./windows/popupWindow";

let tray: Tray | null = null;

function resolveTrayIconPath(): string {
  const appPath = app.getAppPath();

  const candidates = [
    path.join(appPath, "assets", "icon.ico"),
    path.join(process.resourcesPath, "app.asar", "assets", "icon.ico"),
    path.join(process.resourcesPath, "assets", "icon.ico"),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return candidates[0];
}

export function createTray(): Tray {
  if (tray) return tray;

  const iconPath = resolveTrayIconPath();
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip("Rangefinder");

  const menu = Menu.buildFromTemplate([
    { label: "Open Settings", click: () => showSettingsWindow() },
    { label: "Jump Check (Ctrl+Shift+J)", click: () => showPopupWindow("auto") },
    { label: "Manual Planner (Ctrl+Shift+P)", click: () => showPopupWindow("manual") },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.on("click", () => tray?.popUpContextMenu(menu));
  tray.on("right-click", () => tray?.popUpContextMenu(menu));
  tray.on("double-click", () => showPopupWindow("auto"));

  return tray;
}
