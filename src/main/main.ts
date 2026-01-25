import { app, ipcMain } from "electron";
import { createTray } from "./tray";
import { registerHotkeys } from "./hotkey";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { showSettingsWindow, setAppIsQuitting, hideSettingsWindow } from "./windows/settingsWindow";
import { hidePopupWindow, setPopupResultMode } from "./windows/popupWindow";
import { isDevMode } from "./shared/env";
import { setDevState, getDevState } from "./storage/devState";
import { ensureUniverseReady } from "./universe/universeBootstrap";
import { resolveSystemByName, getSystemById } from "./universe/universeDb";
import { calcLightyears } from "./universe/universeMath";
import { BASE_JUMP_RANGE_LY, calcJumpRangeLy, shipClassFromShipName, type JumpShipClass } from "./jump/jumpRange";
import { findRouteESI } from "./planner/routePlanner";
import { registerPopupDebugHotkeys } from "./windows/popupWindow";
import { fetchSystemRegionName, fetchSystemSecurityStatus } from "./universe/esiPublic";

const APP_NAME = "Rangefinder";

const FORBIDDEN_REGIONS = new Set(["pochven", "a821-a", "jzh7-f", "uu4-fa"]);

function isForbiddenRegion(regionName: string | null): boolean {
  const n = String(regionName || "").trim().toLowerCase();
  if (!n) return false;
  return FORBIDDEN_REGIONS.has(n);
}

function secToOneDecimalRound(sec: number): number {
  return Math.round(sec * 10) / 10;
}

function isCynoAllowed(sec: number | null): boolean {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return false;
  return secToOneDecimalRound(sec) <= 0.4;
}

async function isForbiddenSystem(systemId: number): Promise<boolean> {
  const rn = await fetchSystemRegionName(systemId);
  return isForbiddenRegion(rn);
}

async function isCynoSystem(systemId: number): Promise<boolean> {
  const sec = await fetchSystemSecurityStatus(systemId);
  return isCynoAllowed(sec);
}

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
  registerPopupDebugHotkeys();

  ipcMain.on("settings:hide", () => hideSettingsWindow());
  ipcMain.on("popup:hide", () => hidePopupWindow());

  ipcMain.on("popup:setResultMode", (_e, on: boolean) => {
    setPopupResultMode(!!on);
  });

  ipcMain.handle("debug:ping", async () => ({ ok: true, t: Date.now() }));
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

      if (await isForbiddenSystem(to.id)) {
        return {
          ok: false,
          error: "That destination is in a region that cannot be used (Pochven / A821-A / JZH7-F / UU4-FA).",
        };
      }

      if (!(await isCynoSystem(to.id))) {
        return {
          ok: false,
          error: "No cyno route found. (Valid jump points must be 0.4 or below.)",
        };
      }

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

      let midpointsNeeded: number | null = null;
      let route: string[] | null = null;
      let hopLys: number[] | null = null;

      if (!inRange) {
        const res = await findRouteESI(from.id, to.id, maxLy, 80);

        if (!res) {
          return {
            ok: false,
            error: "No cyno route found. (Valid jump points must be 0.4 or below.)",
          };
        }

        midpointsNeeded = Math.max(0, res.jumps - 1);

        route = res.path
          .map((id) => getSystemById(id))
          .filter(Boolean)
          .map((s) => (s as any).name);

        const hop: number[] = [];
        for (let i = 0; i < res.path.length - 1; i++) {
          const a = getSystemById(res.path[i]);
          const b = getSystemById(res.path[i + 1]);
          if (!a || !b) continue;
          hop.push(calcLightyears(a.x, a.y, a.z, b.x, b.y, b.z));
        }
        hopLys = hop;
      }

      return {
        ok: true,
        inRange,
        summary: `${dev.characterName} → ${to.name}`,
        fromSystem: from.name,
        shipClass,
        distLy,
        baseLy,
        maxLy,
        midpointsNeeded,
        route,
        hopLys,
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
  boot().catch(() => {
    app.quit();
  });
});

app.on("before-quit", () => {
  setAppIsQuitting(true);
});

app.on("window-all-closed", () => {});
