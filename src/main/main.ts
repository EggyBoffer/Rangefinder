import { app } from "electron";
import { createTray } from "./tray";
import { registerHotkeys } from "./hotkey";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { showSettingsWindow, setAppIsQuitting } from "./windows/settingsWindow";

app.setName("Cyno Range Check");

function boot(): void {
  createTray();
  registerHotkeys();

  const cfg = loadConfig();

  // Only show settings on first ever run
  if (!cfg.hasLaunchedBefore) {
    showSettingsWindow();
    cfg.hasLaunchedBefore = true;
    saveConfig(cfg);
  }
}

app.whenReady().then(() => {
  boot();
});

app.on("before-quit", () => {
  setAppIsQuitting(true);
});

// Tray app: don't quit when windows are closed
app.on("window-all-closed", () => {});
