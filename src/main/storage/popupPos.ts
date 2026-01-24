import { app } from "electron";
import * as fs from "fs";
import * as path from "path";

export type PopupPos = { x: number; y: number };

function posPath(): string {
  return path.join(app.getPath("userData"), "popup-pos.json");
}

export function loadPopupPos(): PopupPos | null {
  try {
    const p = posPath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

export function savePopupPos(pos: PopupPos): void {
  const p = posPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(pos), "utf-8");
}
