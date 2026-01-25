import { app, globalShortcut } from "electron";
import { loadConfig, saveConfig } from "./storage/appConfig";
import { togglePopupWindow, hidePopupWindow } from "./windows/popupWindow";

export type HotkeyConfig = {
  popupAuto: string;
  popupManual: string;
  hidePopup: string;
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

  if (!popupAuto || !popupManual || !hidePopupAcc) {
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
