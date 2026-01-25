import { BrowserWindow, screen, globalShortcut, app } from "electron";
import path from "path";
import fs from "fs";
import { isDevMode } from "../shared/env";

let popupWindow: BrowserWindow | null = null;

const POPUP_W = 520;
const POPUP_H_AUTO = 170;
const POPUP_H_MANUAL = 210;
const POPUP_H_RESULT = 340;

function firstExisting(paths: string[]): string {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return paths[0];
}

function getPopupHtmlPath(): string {
  const appPath = app.getAppPath();
  return firstExisting([
    path.join(appPath, "dist", "renderer", "popup", "index.html"),
    path.join(process.cwd(), "dist", "renderer", "popup", "index.html")
  ]);
}

function getPreloadPath(): string {
  const base = path.resolve(__dirname, "..");
  return firstExisting([
    path.join(base, "preload", "popupPreload.js"),
    path.join(app.getAppPath(), "dist", "main", "preload", "popupPreload.js"),
    path.join(process.cwd(), "dist", "main", "preload", "popupPreload.js")
  ]);
}

function centerOnCursor(win: BrowserWindow, w: number, h: number): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  win.setPosition(Math.round(x + width / 2 - w / 2), Math.round(y + height / 2 - h / 2), false);
}

function applySize(win: BrowserWindow, h: number): void {
  win.setResizable(false);
  win.setSize(POPUP_W, h, false);
  centerOnCursor(win, POPUP_W, h);
}

function inputHeightForMode(mode: "auto" | "manual"): number {
  return mode === "manual" ? POPUP_H_MANUAL : POPUP_H_AUTO;
}

function ensureWindow(): BrowserWindow {
  if (popupWindow && !popupWindow.isDestroyed()) return popupWindow;

  popupWindow = new BrowserWindow({
    width: POPUP_W,
    height: POPUP_H_AUTO,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  popupWindow.on("close", (e) => {
    e.preventDefault();
    hidePopupWindow();
  });

  popupWindow.on("blur", () => {
    if (!isDevMode()) hidePopupWindow();
  });

  popupWindow.on("closed", () => {
    popupWindow = null;
  });

  popupWindow.loadFile(getPopupHtmlPath()).catch(() => {});

  return popupWindow;
}

function sendPopupState(win: BrowserWindow, mode: "auto" | "manual"): void {
  const send = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("popup:mode", mode);
    win.webContents.send("popup:reset");
  };

  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
    return;
  }

  send();
}

export function showPopupWindow(mode: "auto" | "manual"): void {
  const win = ensureWindow();
  applySize(win, inputHeightForMode(mode));
  win.show();
  win.focus();
  sendPopupState(win, mode);
}

export function togglePopupWindow(mode: "auto" | "manual" = "auto"): void {
  const win = ensureWindow();
  if (win.isVisible()) {
    hidePopupWindow();
    return;
  }
  showPopupWindow(mode);
}

export function hidePopupWindow(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;

  const win = popupWindow;
  try {
    win.webContents.send("popup:reset");
  } catch {}

  win.hide();
  win.destroy();
  popupWindow = null;
}

export function setPopupResultMode(on: boolean): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  applySize(popupWindow, on ? POPUP_H_RESULT : POPUP_H_AUTO);
}

export function registerPopupDebugHotkeys(): void {
  if (!isDevMode()) return;

  globalShortcut.register("Control+Shift+O", () => {
    const win = ensureWindow();
    applySize(win, POPUP_H_AUTO);
    win.show();
    win.focus();
    win.webContents.openDevTools({ mode: "detach" });
  });

  globalShortcut.register("Control+Shift+Alt+P", () => {
    const win = ensureWindow();
    win.show();
    win.focus();
    win.setResizable(true);
    win.setSize(980, 640, false);
  });
}
