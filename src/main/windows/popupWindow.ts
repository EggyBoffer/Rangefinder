import { BrowserWindow, screen } from "electron";
import * as path from "path";

let popupWindow: BrowserWindow | null = null;

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

  const htmlPath = path.join(__dirname, "..", "..", "renderer", "popup", "index.html");
  popupWindow.loadFile(htmlPath);

  popupWindow.once("ready-to-show", () => popupWindow?.show());

  // Hide when it loses focus (nice “quick panel” behaviour)
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
