import { app, ipcMain } from "electron";
import { createTray } from "./tray";
import { registerHotkeys } from "./hotkey";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { showSettingsWindow, setAppIsQuitting, hideSettingsWindow } from "./windows/settingsWindow";
import { hidePopupWindow } from "./windows/popupWindow";
import { isDevMode } from "./shared/env";
import { setDevState, getDevState } from "./storage/devState";

const APP_NAME = "Rangefinder";

app.setName(APP_NAME);

if (process.platform === "win32") {
  app.setAppUserModelId("uk.co.rangefinder.app");
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showSettingsWindow();
  });
}

function boot(): void {
  createTray();
  registerHotkeys();

  ipcMain.on("settings:hide", () => hideSettingsWindow());
  ipcMain.on("popup:hide", () => hidePopupWindow());
  ipcMain.handle("dev:getState", () => getDevState());

  if (isDevMode()) {
    setDevState({
      enabled: true,
      characterName: "Dev - Redeemer",
      systemName: "Rakapas",
      shipName: "Redeemer",
      jumpCalibrationLevel: 5,
    });
  } else {
    setDevState({ enabled: false });
  }

  const cfg = loadConfig();
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

app.on("window-all-closed", () => {});
