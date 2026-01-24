import { BrowserWindow, app } from "electron";
import * as path from "path";
import * as fs from "fs";

let settingsWindow: BrowserWindow | null = null;
let isQuitting = false;

export function setAppIsQuitting(v: boolean): void {
  isQuitting = v;
}

function resolveSettingsHtmlPath(): string {
  // Prefer dist/renderer if it exists (future-proof)
  const distPath = path.join(app.getAppPath(), "dist", "renderer", "settings", "index.html");
  if (fs.existsSync(distPath)) return distPath;

  // Dev path (what you have right now)
  return path.join(app.getAppPath(), "src", "renderer", "settings", "index.html");
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
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  settingsWindow.loadFile(resolveSettingsHtmlPath());

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  // Close button hides window (tray app behaviour)
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
