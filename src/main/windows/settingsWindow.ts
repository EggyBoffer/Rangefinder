import { BrowserWindow } from "electron";
import * as path from "path";

let settingsWindow: BrowserWindow | null = null;
let isQuitting = false;

export function setAppIsQuitting(v: boolean): void {
  isQuitting = v;
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
    frame: false,                 // ✅ removes title bar
    titleBarStyle: "hidden",      // extra safety on Windows
    backgroundColor: "#ffffff",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const htmlPath = path.join(
    __dirname,
    "..",
    "..",
    "renderer",
    "settings",
    "index.html"
  );
  settingsWindow.loadFile(htmlPath);

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
  });

  // Close button should NOT quit the app — it hides the settings window
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
