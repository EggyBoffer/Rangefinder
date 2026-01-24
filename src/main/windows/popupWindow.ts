import { BrowserWindow, screen, app } from "electron";
import * as path from "path";
import * as fs from "fs";

let popupWindow: BrowserWindow | null = null;
let lastMode: "auto" | "manual" = "auto";

function resolvePopupHtmlPath(): string {
  const distPath = path.join(app.getAppPath(), "dist", "renderer", "popup", "index.html");
  if (fs.existsSync(distPath)) return distPath;
  return path.join(app.getAppPath(), "src", "renderer", "popup", "index.html");
}

function resolvePopupPreloadPath(): string {
  return path.join(__dirname, "..", "preload", "popupPreload.js");
}

function sendReset(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  popupWindow.webContents.send("popup:reset");
}

function sendMode(mode: "auto" | "manual"): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  popupWindow.webContents.send("popup:mode", mode);
}

export function hidePopupWindow(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  sendReset();
  popupWindow.hide();
}

export function isPopupVisible(): boolean {
  return Boolean(popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible());
}

export function showPopupWindow(mode: "auto" | "manual"): void {
  const win = createPopupWindow();
  lastMode = mode;
  sendMode(mode);
  sendReset();
  win.show();
  win.focus();
}

export function togglePopupWindow(mode: "auto" | "manual"): void {
  if (isPopupVisible()) {
    hidePopupWindow();
  } else {
    showPopupWindow(mode);
  }
}

export function createPopupWindow(): BrowserWindow {
  if (popupWindow && !popupWindow.isDestroyed()) return popupWindow;

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  popupWindow = new BrowserWindow({
    width: 460,
    height: 240,
    x: Math.max(0, sw - 480),
    y: Math.max(0, sh - 230),
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    frame: false,
    show: false,
    transparent: false,
    backgroundColor: "#0b0f18",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolvePopupPreloadPath(),
    },
  });

  popupWindow.loadFile(resolvePopupHtmlPath());

  popupWindow.webContents.on("did-finish-load", () => {
    sendMode(lastMode);
    sendReset();
  });

  popupWindow.on("close", (e) => {
    e.preventDefault();
    hidePopupWindow();
  });

  popupWindow.on("blur", () => {
    hidePopupWindow();
  });

  return popupWindow;
}
