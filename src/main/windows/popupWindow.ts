import { BrowserWindow, screen, app } from "electron";
import * as path from "path";
import * as fs from "fs";

let popupWindow: BrowserWindow | null = null;

function resolvePopupHtmlPath(): string {
  const distPath = path.join(app.getAppPath(), "dist", "renderer", "popup", "index.html");
  if (fs.existsSync(distPath)) return distPath;

  return path.join(app.getAppPath(), "src", "renderer", "popup", "index.html");
}

export function createPopupWindow(): BrowserWindow {
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.show();
    popupWindow.focus();
    return popupWindow;
  }

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  popupWindow = new BrowserWindow({
    width: 420,
    height: 260,
    x: Math.max(0, sw - 440),
    y: Math.max(0, sh - 300),
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    frame: false,
    show: false,
    title: "Jump Check",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  popupWindow.loadFile(resolvePopupHtmlPath());

  popupWindow.once("ready-to-show", () => popupWindow?.show());

  // Hide when it loses focus
  popupWindow.on("blur", () => popupWindow?.hide());

  popupWindow.on("closed", () => {
    popupWindow = null;
  });

  return popupWindow;
}

export function showPopupWindow(): void {
  const win = createPopupWindow();
  win.show();
  win.focus();
}
