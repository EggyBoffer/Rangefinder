import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export type AppConfig = {
  hasLaunchedBefore: boolean;
  hotkeys: {
    popupAuto: string;
    popupManual: string;
    hidePopup: string;
    intelSearch: string;
  };
  planner: {
    maxGateJumpsToCheck: number;
  };
  lastUpdatePromptedVersion: string;
};

const DEFAULT_CONFIG: AppConfig = {
  hasLaunchedBefore: false,
  hotkeys: {
    popupAuto: "Control+Shift+J",
    popupManual: "Control+Shift+P",
    hidePopup: "Control+Shift+K",
    intelSearch: "Control+Shift+I",
  },
  planner: {
    maxGateJumpsToCheck: 3,
  },
  lastUpdatePromptedVersion: "",
};

function getConfigPath(): string {
  return path.join(app.getPath("userData"), "config.json");
}

function clampInt(n: any, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  const i = Math.floor(v);
  return Math.max(min, Math.min(max, i));
}

export function loadConfig(): AppConfig {
  try {
    const p = getConfigPath();
    if (!fs.existsSync(p)) return { ...DEFAULT_CONFIG };

    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppConfig>;

    return {
      hasLaunchedBefore: Boolean((parsed as any)?.hasLaunchedBefore),
      hotkeys: {
        popupAuto: String((parsed as any)?.hotkeys?.popupAuto || DEFAULT_CONFIG.hotkeys.popupAuto),
        popupManual: String((parsed as any)?.hotkeys?.popupManual || DEFAULT_CONFIG.hotkeys.popupManual),
        hidePopup: String((parsed as any)?.hotkeys?.hidePopup || DEFAULT_CONFIG.hotkeys.hidePopup),
        intelSearch: String((parsed as any)?.hotkeys?.intelSearch || DEFAULT_CONFIG.hotkeys.intelSearch),
      },
      planner: {
        maxGateJumpsToCheck: clampInt(
          (parsed as any)?.planner?.maxGateJumpsToCheck,
          0,
          10,
          DEFAULT_CONFIG.planner.maxGateJumpsToCheck
        ),
      },
      lastUpdatePromptedVersion: String((parsed as any)?.lastUpdatePromptedVersion || ""),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(cfg: AppConfig): void {
  const p = getConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(cfg, null, 2), "utf-8");
}