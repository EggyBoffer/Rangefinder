import { BrowserWindow, screen, app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { loadPopupPos, savePopupPos } from "../storage/popupPos";

let popupWindow: BrowserWindow | null = null;

const SIZE_INPUT = { w: 420, h: 140 };
const SIZE_RESULT = { w: 420, h: 230 };

function resolvePopupHtmlPath(): string {
  const distPath = path.join(app.getAppPath(), "dist", "renderer", "popup", "index.html");
  if (fs.existsSync(distPath)) return distPath;
  return path.join(app.getAppPath(), "src", "renderer", "popup", "index.html");
}

function resolvePopupPreloadPath(): string {
  return path.join(__dirname, "..", "preload", "popupPreload.js");
}

function clampToWorkArea(x: number, y: number, w: number, h: number) {
  const wa = screen.getPrimaryDisplay().workArea;
  const cx = Math.min(Math.max(x, wa.x), wa.x + wa.width - w);
  const cy = Math.min(Math.max(y, wa.y), wa.y + wa.height - h);
  return { x: cx, y: cy };
}

function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - SIZE_INPUT.w - 20, y: wa.y + wa.height - SIZE_INPUT.h - 40 };
}

function getStartPos() {
  const saved = loadPopupPos();
  if (!saved) return defaultPos();
  return clampToWorkArea(saved.x, saved.y, SIZE_INPUT.w, SIZE_INPUT.h);
}

function sendReset(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  popupWindow.webContents.send("popup:reset");
}

function sendMode(mode: "input" | "result"): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  popupWindow.webContents.send("popup:mode", mode);
}

export function hidePopupWindow(): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;
  sendReset();
  sendMode("input");
  popupWindow.setSize(SIZE_INPUT.w, SIZE_INPUT.h, false);
  popupWindow.hide();
}

export function isPopupVisible(): boolean {
  return Boolean(popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible());
}

export function showPopupWindow(): void {
  const win = createPopupWindow();
  sendReset();
  sendMode("input");
  win.setSize(SIZE_INPUT.w, SIZE_INPUT.h, false);
  win.show();
  win.focus();
}

export function togglePopupWindow(): void {
  if (isPopupVisible()) hidePopupWindow();
  else showPopupWindow();
}

export function createPopupWindow(): BrowserWindow {
  if (popupWindow && !popupWindow.isDestroyed()) return popupWindow;

  const pos = getStartPos();

  popupWindow = new BrowserWindow({
    width: SIZE_INPUT.w,
    height: SIZE_INPUT.h,
    x: pos.x,
    y: pos.y,
    resizable: false,
    maximizable: false,
    minimizable: false,
    alwaysOnTop: true,
    frame: false,
    show: false,
    transparent: false,
    backgroundColor: "#0b0f18",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: resolvePopupPreloadPath(),
    },
  });

  popupWindow.loadFile(resolvePopupHtmlPath());

  popupWindow.webContents.on("did-finish-load", () => {
    sendReset();
    sendMode("input");
  });

  popupWindow.on("move", () => {
    if (!popupWindow || popupWindow.isDestroyed()) return;
    const b = popupWindow.getBounds();
    savePopupPos({ x: b.x, y: b.y });
  });

  popupWindow.on("close", (e) => {
    e.preventDefault();
    hidePopupWindow();
  });

  popupWindow.on("blur", () => {
    hidePopupWindow();
  });

  return popupWindow;
}

export function setPopupMode(mode: "input" | "result"): void {
  if (!popupWindow || popupWindow.isDestroyed()) return;

  const curBounds = popupWindow.getBounds();
  const size = mode === "result" ? SIZE_RESULT : SIZE_INPUT;

  const clamped = clampToWorkArea(curBounds.x, curBounds.y, size.w, size.h);
  popupWindow.setBounds({ x: clamped.x, y: clamped.y, width: size.w, height: size.h }, false);

  sendMode(mode);
}
