import { app, ipcMain, shell, clipboard } from "electron";
import { createTray } from "./tray";
import { getHotkeys, registerHotkeys, resetHotkeysToDefault, setHotkeys, type HotkeyConfig } from "./hotkey";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { showSettingsWindow, setAppIsQuitting, hideSettingsWindow } from "./windows/settingsWindow";
import { hidePopupWindow, registerPopupDebugHotkeys, setPopupResultMode } from "./windows/popupWindow";
import { hideIntelWindow } from "./windows/intelWindow";
import { isDevMode } from "./shared/env";
import { setDevState, getDevState } from "./storage/devState";
import { ensureUniverseReady } from "./universe/universeBootstrap";
import { resolveSystemByName, getSystemById, suggestSystemsByName } from "./universe/universeDb";
import { calcLightyears } from "./universe/universeMath";
import {
  BASE_JUMP_RANGE_LY,
  calcJumpRangeLy,
  shipClassFromShipName,
  shipClassFromEsiType,
  type JumpShipClass,
} from "./jump/jumpRange";
import { findRouteESI } from "./planner/routePlanner";
import { fetchSystemRegionName, fetchSystemSecurityStatus } from "./universe/esiPublic";
import {
  loadEsiStore,
  removeCharacter as esiRemoveCharacter,
  setActiveCharacter as esiSetActiveCharacter,
} from "./esi/esiStore";
import { startAddCharacter, fetchEsiCharacterLocationShipAndSkills, fetchEsiCharacterJdcLevel } from "./esi/esiAuth";
import { maybeShowUpdatePopup } from "./updater/updateNotify";
import { lookupCharacterIntel, getKillmailEnriched } from "./intel/intelService";

const APP_NAME = "Rangefinder";

const FORBIDDEN_REGIONS = new Set(["pochven", "a821-a", "j7hz-f", "uua-f4"]);

function isForbiddenRegion(regionName: string | null): boolean {
  const n = String(regionName || "").trim().toLowerCase();
  if (!n) return false;
  return FORBIDDEN_REGIONS.has(n);
}

function secToOneDecimalTrunc(sec: number): number {
  return Math.floor(sec * 10) / 10;
}

function isCynoAllowed(sec: number | null): boolean {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return false;
  return secToOneDecimalTrunc(sec) <= 0.4;
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
  ipcMain.on("intel:hide", () => hideIntelWindow());

  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    const u = String(url || "").trim();
    if (!u) return { ok: false, error: "Missing URL" };
    try {
      await shell.openExternal(u);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || "Failed to open link") };
    }
  });

  // ✅ Reliable clipboard for overlay windows
  ipcMain.handle("clipboard:writeText", async (_e, text: string) => {
    const t = String(text ?? "");
    if (!t) return { ok: false, error: "Missing text" };
    try {
      clipboard.writeText(t);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || "Clipboard write failed") };
    }
  });

  ipcMain.on("popup:setResultMode", (_e, on: boolean) => {
    setPopupResultMode(!!on);
  });

  ipcMain.handle("config:getHotkeys", async () => getHotkeys());

  ipcMain.handle("config:setHotkeys", async (_e: any, hotkeys: HotkeyConfig) => {
    return setHotkeys(hotkeys);
  });

  ipcMain.handle("config:resetHotkeys", async () => {
    return resetHotkeysToDefault();
  });

  ipcMain.handle("debug:ping", async () => ({ ok: true, t: Date.now() }));

  ipcMain.handle("intel:lookupCharacter", async (_e, name: string) => {
    const n = String(name || "").trim();
    if (!n) return { ok: false, error: "Missing character name" };
    return lookupCharacterIntel(n);
  });

  ipcMain.handle(
    "intel:getKillmailEnriched",
    async (_e, killmailId: number, killmailHash: string, characterId: number) => {
      return getKillmailEnriched(killmailId, killmailHash, characterId);
    }
  );

  ipcMain.handle("dev:getState", () => getDevState());

  ipcMain.handle("esi:listCharacters", () => loadEsiStore());

  ipcMain.handle("esi:getActiveCharacterId", () => {
    const s = loadEsiStore();
    return s.activeCharacterId ?? null;
  });

  ipcMain.handle("esi:setActiveCharacterId", (_e, id: number) => {
    const s = esiSetActiveCharacter(id);
    return s.activeCharacterId ?? null;
  });

  ipcMain.handle("esi:addCharacter", async () => {
    const res = await startAddCharacter();
    if (!res.ok) return { ok: false, error: res.error || "Login failed" };
    return { ok: true, store: loadEsiStore() };
  });

  ipcMain.handle("esi:removeCharacter", async (_e, id: number) => {
    const s = esiRemoveCharacter(id);
    return s;
  });

  ipcMain.handle("universe:resolveSystem", async (_e, name: string) => {
    const n = String(name || "").trim();
    if (!n) return null;
    return resolveSystemByName(n);
  });

  ipcMain.handle("universe:suggestSystems", async (_e, query: string, limit?: number) => {
    const q = String(query || "").trim();
    if (!q) return [];
    const lim = typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.min(25, Math.floor(limit))) : 10;
    return suggestSystemsByName(q, lim);
  });

  ipcMain.handle(
    "jumpcheck:run",
    async (
      _e,
      payload: {
        mode: "auto" | "manual";
        characterKey: "dev" | "esi";
        characterId?: number;
        destinationSystem: string;
        fromSystem?: string;
        shipClass?: JumpShipClass;
        shipName?: string;
      }
    ) => {
      const mode = payload?.mode;
      const characterKey = String(payload?.characterKey || "").trim() as "dev" | "esi";
      const destinationSystem = String(payload?.destinationSystem || "").trim();

      if (!mode || !characterKey || !destinationSystem) return { ok: false, error: "Missing input" };

      const to = resolveSystemByName(destinationSystem);
      if (!to) return { ok: false, error: "Destination system not found" };

      if (await isForbiddenSystem(to.id)) {
        return {
          ok: false,
          error: "That destination is in a region that cannot be used (Pochven / A821-A / J7HZ-F / UUA-F4).",
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
      let characterName = "";
      let jdcLevel = 5;

      if (characterKey === "dev") {
        const dev = getDevState();
        if (!dev.enabled) return { ok: false, error: "Dev disabled" };

        characterName = dev.characterName;
        jdcLevel = dev.jumpCalibrationLevel;

        if (mode === "auto") {
          fromName = dev.systemName;
          shipClass = shipClassFromShipName(dev.shipName);
          if (!shipClass) return { ok: false, error: "Unknown ship for range" };
        } else {
          fromName = String(payload?.fromSystem || "").trim();
          const sn = String(payload?.shipName || "").trim();
          shipClass = payload?.shipClass ?? (sn ? shipClassFromShipName(sn) : null);
          if (!fromName || !shipClass) return { ok: false, error: "Missing input" };
        }
      } else {
        const store = loadEsiStore();
        const characterId =
          typeof payload?.characterId === "number" ? payload.characterId : store.activeCharacterId ?? null;

        if (!characterId) return { ok: false, error: "No character linked yet" };

        if (mode === "auto") {
          const esi = await fetchEsiCharacterLocationShipAndSkills(characterId);
          if (!esi.ok) return { ok: false, error: esi.error };

          characterName = esi.characterName;
          fromName = esi.systemName;
          jdcLevel = esi.jdcLevel;

          shipClass =
            shipClassFromEsiType({
              groupId: esi.shipGroupId,
              groupName: esi.shipGroupName,
              typeName: esi.shipTypeName,
            }) ?? null;

          if (!shipClass) return { ok: false, error: "Unknown ship for range" };
        } else {
          const sk = await fetchEsiCharacterJdcLevel(characterId);
          if (!sk.ok) return { ok: false, error: sk.error };
          characterName = sk.characterName;
          jdcLevel = sk.jdcLevel;

          fromName = String(payload?.fromSystem || "").trim();
          const sn = String(payload?.shipName || "").trim();
          shipClass = payload?.shipClass ?? (sn ? shipClassFromShipName(sn) : null);

          if (!fromName || !shipClass) return { ok: false, error: "Missing input" };
        }
      }

      const from = resolveSystemByName(fromName);
      if (!from) return { ok: false, error: "From system not found" };

      const baseLy = BASE_JUMP_RANGE_LY[shipClass];
      const maxLy = calcJumpRangeLy(baseLy, jdcLevel);

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
        summary: `${characterName} → ${to.name}`,
        fromSystem: from.name,
        shipClass,
        distLy,
        baseLy,
        maxLy,
        midpointsNeeded,
        route,
        hopLys,
        jdcLevel,
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

  setTimeout(() => {
    maybeShowUpdatePopup().catch(() => {});
  }, 1200);
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