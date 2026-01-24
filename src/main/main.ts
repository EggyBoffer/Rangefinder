import { app, ipcMain } from "electron";
import { createTray } from "./tray";
import { registerHotkeys } from "./hotkey";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { showSettingsWindow, setAppIsQuitting, hideSettingsWindow } from "./windows/settingsWindow";
import { hidePopupWindow } from "./windows/popupWindow";
import { isDevMode } from "./shared/env";
import { setDevState, getDevState } from "./storage/devState";
import { ensureUniverseReady } from "./universe/universeBootstrap";
import { resolveSystemByName } from "./universe/universeDb";
import { calcLightyears } from "./universe/universeMath";
import { BASE_JUMP_RANGE_LY, calcJumpRangeLy, shipClassFromShipName, type JumpShipClass } from "./jump/jumpRange";


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

  async function boot(): Promise<void> {
    await ensureUniverseReady();

    createTray();
    registerHotkeys();

    ipcMain.on("settings:hide", () => hideSettingsWindow());
    ipcMain.on("popup:hide", () => hidePopupWindow());

    ipcMain.handle("dev:getState", () => getDevState());

    ipcMain.handle("universe:resolveSystem", async (_e, name: string) => {
      const n = String(name || "").trim();
      if (!n) return null;
      return resolveSystemByName(n);
    });

      ipcMain.handle(
    "jumpcheck:run",
    async (
      _e,
      payload: {
        mode: "auto" | "manual";
        characterKey: string;
        destinationSystem: string;
        fromSystem?: string;
        shipClass?: JumpShipClass;
      }
    ) => {
      const mode = payload?.mode;
      const characterKey = String(payload?.characterKey || "").trim();
      const destinationSystem = String(payload?.destinationSystem || "").trim();

      if (!mode || !characterKey || !destinationSystem) return { ok: false, error: "Missing input" };
      if (characterKey !== "dev") return { ok: false, error: "Character not supported yet" };

      const dev = getDevState();
      if (!dev.enabled) return { ok: false, error: "Dev disabled" };

      const to = resolveSystemByName(destinationSystem);
      if (!to) return { ok: false, error: "Destination system not found" };

      let fromName = "";
      let shipClass: JumpShipClass | null = null;

      if (mode === "auto") {
        fromName = dev.systemName;
        shipClass = shipClassFromShipName(dev.shipName);
        if (!shipClass) return { ok: false, error: "Unknown ship for range" };
      } else {
        fromName = String(payload?.fromSystem || "").trim();
        shipClass = payload?.shipClass ?? null;
        if (!fromName || !shipClass) return { ok: false, error: "Missing input" };
      }

      const from = resolveSystemByName(fromName);
      if (!from) return { ok: false, error: "From system not found" };

      const baseLy = BASE_JUMP_RANGE_LY[shipClass];
      const maxLy = calcJumpRangeLy(baseLy, dev.jumpCalibrationLevel);

      const distLy = calcLightyears(from.x, from.y, from.z, to.x, to.y, to.z);
      const inRange = distLy <= maxLy;

      return {
        ok: true,
        inRange,
        summary: `${dev.characterName} → ${to.name}`,
        fromSystem: from.name,
        shipClass,
        distLy,
        baseLy,
        maxLy,
        jdcLevel: dev.jumpCalibrationLevel,
      };
    }
  );




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
