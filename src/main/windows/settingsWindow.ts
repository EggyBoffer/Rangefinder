import { BrowserWindow, app } from "electron";
import * as path from "path";
import * as fs from "fs";

let settingsWindow: BrowserWindow | null = null;
let isQuitting = false;

export function setAppIsQuitting(v: boolean): void {
  isQuitting = v;
}

export function hideSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.hide();
}

function resolveSettingsHtmlPath(): string {
  const distPath = path.join(app.getAppPath(), "dist", "renderer", "settings", "index.html");
  if (fs.existsSync(distPath)) return distPath;
  return path.join(app.getAppPath(), "src", "renderer", "settings", "index.html");
}

function resolveSettingsPreloadPath(): string {
  return path.join(__dirname, "..", "preload", "settingsPreload.js");
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return settingsWindow;
  }

  settingsWindow = new BrowserWindow({
    width: 900,
    height: 650,
    show: false,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0b0f18",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolveSettingsPreloadPath(),
    },
  });

  settingsWindow.loadFile(resolveSettingsHtmlPath());

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  settingsWindow.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    settingsWindow?.hide();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  return settingsWindow;
}

export function showSettingsWindow(): void {
  createSettingsWindow();
}
