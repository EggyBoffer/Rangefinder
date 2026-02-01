import { BrowserWindow, screen, app } from "electron";
import path from "path";
import fs from "fs";
import { isDevMode } from "../shared/env";

let intelWindow: BrowserWindow | null = null;

const WIN_W = 560;
const WIN_H = 420;

function firstExisting(paths: string[]): string {
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return paths[0];
}

function getIntelHtmlPath(): string {
  const appPath = app.getAppPath();
  return firstExisting([
    path.join(appPath, "dist", "renderer", "intel", "index.html"),
    path.join(process.cwd(), "dist", "renderer", "intel", "index.html"),
  ]);
}

function getPreloadPath(): string {
  const base = path.resolve(__dirname, "..");
  return firstExisting([
    path.join(base, "preload", "intelPreload.js"),
    path.join(app.getAppPath(), "dist", "main", "preload", "intelPreload.js"),
    path.join(process.cwd(), "dist", "main", "preload", "intelPreload.js"),
  ]);
}

function centerOnCursor(win: BrowserWindow, w: number, h: number): void {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const { x, y, width, height } = display.workArea;
  win.setPosition(Math.round(x + width / 2 - w / 2), Math.round(y + height / 2 - h / 2), false);
}

function ensureWindow(): BrowserWindow {
  if (intelWindow && !intelWindow.isDestroyed()) return intelWindow;

  intelWindow = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    show: false,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  intelWindow.on("close", (e) => {
    e.preventDefault();
    hideIntelWindow();
  });

  intelWindow.on("blur", () => {
    if (!isDevMode()) hideIntelWindow();
  });

  intelWindow.on("closed", () => {
    intelWindow = null;
  });

  intelWindow.loadFile(getIntelHtmlPath()).catch(() => {});

  return intelWindow;
}

export function showIntelWindow(): void {
  const win = ensureWindow();
  win.setResizable(false);
  win.setSize(WIN_W, WIN_H, false);
  centerOnCursor(win, WIN_W, WIN_H);
  win.show();
  win.focus();

  const send = () => {
    if (win.isDestroyed()) return;
    win.webContents.send("intel:reset");
  };

  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

export function toggleIntelWindow(): void {
  const win = ensureWindow();
  if (win.isVisible()) {
    hideIntelWindow();
    return;
  }
  showIntelWindow();
}

export function hideIntelWindow(): void {
  if (!intelWindow || intelWindow.isDestroyed()) return;

  const win = intelWindow;
  try {
    win.webContents.send("intel:reset");
  } catch {}

  win.hide();
  win.destroy();
  intelWindow = null;
}
