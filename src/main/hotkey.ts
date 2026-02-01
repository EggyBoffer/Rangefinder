import { app, globalShortcut } from "electron";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { togglePopupWindow, hidePopupWindow } from "./windows/popupWindow";
import { toggleIntelWindow } from "./windows/intelWindow";

export type HotkeyConfig = {
  popupAuto: string;
  popupManual: string;
  hidePopup: string;
  intelSearch: string;
};

let registered = false;

function normalizeAccelerator(v: string): string {
  return String(v || "").trim();
}

function unregisterAll(): void {
  try {
    globalShortcut.unregisterAll();
  } catch {}
}

function registerFrom(cfg: HotkeyConfig): { ok: true } | { ok: false; error: string } {
  unregisterAll();

  const popupAuto = normalizeAccelerator(cfg.popupAuto);
  const popupManual = normalizeAccelerator(cfg.popupManual);
  const hidePopupAcc = normalizeAccelerator(cfg.hidePopup);
  const intelSearch = normalizeAccelerator(cfg.intelSearch);

  if (!popupAuto || !popupManual || !hidePopupAcc || !intelSearch) {
    return { ok: false, error: "Hotkeys cannot be blank" };
  }

  const okA = globalShortcut.register(popupAuto, () => togglePopupWindow("auto"));
  if (!okA) return { ok: false, error: `Failed to register: ${popupAuto}` };

  const okM = globalShortcut.register(popupManual, () => togglePopupWindow("manual"));
  if (!okM) {
    unregisterAll();
    return { ok: false, error: `Failed to register: ${popupManual}` };
  }

  const okH = globalShortcut.register(hidePopupAcc, () => hidePopupWindow());
  if (!okH) {
    unregisterAll();
    return { ok: false, error: `Failed to register: ${hidePopupAcc}` };
  }

  const okI = globalShortcut.register(intelSearch, () => toggleIntelWindow());
  if (!okI) {
    unregisterAll();
    return { ok: false, error: `Failed to register: ${intelSearch}` };
  }

  return { ok: true };
}

export function registerHotkeys(): void {
  if (registered) return;
  registered = true;

  const cfg = loadConfig();
  registerFrom(cfg.hotkeys);

  app.on("will-quit", () => {
    unregisterAll();
  });
}

export function getHotkeys(): HotkeyConfig {
  const cfg = loadConfig();
  return { ...cfg.hotkeys };
}

export function setHotkeys(next: HotkeyConfig): { ok: true } | { ok: false; error: string } {
  const cfg = loadConfig();
  const res = registerFrom(next);
  if (!res.ok) {
    registerFrom(cfg.hotkeys);
    return res;
  }

  cfg.hotkeys = {
    popupAuto: normalizeAccelerator(next.popupAuto),
    popupManual: normalizeAccelerator(next.popupManual),
    hidePopup: normalizeAccelerator(next.hidePopup),
    intelSearch: normalizeAccelerator(next.intelSearch),
  };
  saveConfig(cfg);
  return { ok: true };
}

export function resetHotkeysToDefault(): { ok: true } | { ok: false; error: string } {
  const cfg = loadConfig();
  const defaults = {
    popupAuto: "Control+Shift+J",
    popupManual: "Control+Shift+P",
    hidePopup: "Control+Shift+K",
    intelSearch: "Control+Shift+I",
  };
  const res = registerFrom(defaults);
  if (!res.ok) {
    registerFrom(cfg.hotkeys);
    return res;
  }
  cfg.hotkeys = defaults;
  saveConfig(cfg);
  return { ok: true };
}
