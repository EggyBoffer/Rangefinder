import { app, shell } from "electron";
import * as https from "https";
import { loadConfig, saveConfig } from "../storage/appConfig";
import { isDevMode } from "../shared/env";
import { showUpdateNoticeWindow } from "../windows/updateNoticeWindow";

type LatestRelease = {
  tag_name?: string;
  html_url?: string;
  name?: string;
  body?: string;
};

function normalizeVersion(v: string): string {
  const s = String(v || "").trim();
  if (!s) return "";
  return s.startsWith("v") || s.startsWith("V") ? s.slice(1) : s;
}

function parseSemver(v: string): { a: number; b: number; c: number } {
  const s = normalizeVersion(v).split("-")[0].trim();
  const parts = s.split(".").map((x) => parseInt(x, 10));
  const a = Number.isFinite(parts[0]) ? parts[0] : 0;
  const b = Number.isFinite(parts[1]) ? parts[1] : 0;
  const c = Number.isFinite(parts[2]) ? parts[2] : 0;
  return { a, b, c };
}

function isNewer(remote: string, local: string): boolean {
  const r = parseSemver(remote);
  const l = parseSemver(local);
  if (r.a !== l.a) return r.a > l.a;
  if (r.b !== l.b) return r.b > l.b;
  return r.c > l.c;
}

function fetchLatestRelease(owner: string, repo: string): Promise<LatestRelease | null> {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  return new Promise((resolve) => {
    const req = https.request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "Rangefinder",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        const code = res.statusCode || 0;
        if (code < 200 || code >= 300) {
          res.resume();
          resolve(null);
          return;
        }

        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data) as LatestRelease;
            resolve(json || null);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function cleanPatchNotesPreview(body: string): string {
  const raw = String(body || "").trim();
  if (!raw) return "";

  const lines = raw
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("```"));

  const out: string[] = [];
  for (const line of lines) {
    if (out.length >= 6) break;

    if (line.startsWith("#")) continue;

    let s = line;

    s = s.replace(/^[-*]\s+/, "");
    s = s.replace(/^\d+\.\s+/, "");
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    s = s.replace(/`([^`]+)`/g, "$1");
    s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
    s = s.replace(/\*([^*]+)\*/g, "$1");
    s = s.replace(/__([^_]+)__/g, "$1");
    s = s.replace(/_([^_]+)_/g, "$1");
    s = s.trim();

    if (!s) continue;
    if (s.length > 90) s = s.slice(0, 90).trimEnd() + "…";

    out.push("• " + s);
  }

  return out.join("\n");
}

export async function maybeShowUpdatePopup(): Promise<void> {
  if (isDevMode()) return;
  if (process.env.RANGEFINDER_DISABLE_UPDATE_CHECK === "1") return;

  const localVersion = normalizeVersion(app.getVersion());
  if (!localVersion) return;

  const latest = await fetchLatestRelease("EggyBoffer", "Rangefinder");
  if (!latest) return;

  const latestTag = normalizeVersion(String(latest.tag_name || "").trim());
  if (!latestTag) return;

  if (!isNewer(latestTag, localVersion)) return;

  const cfg = loadConfig();
  if (cfg.lastUpdatePromptedVersion === latestTag) return;

  const releaseName = String(latest.name || "").trim();
  const releaseUrl = String(latest.html_url || "").trim();
  const preview = cleanPatchNotesPreview(String(latest.body || ""));

  const action = await showUpdateNoticeWindow({
    localVersion,
    latestVersion: latestTag,
    releaseName,
    patchNotesPreview: preview,
    hasReleaseUrl: !!releaseUrl,
  });

  cfg.lastUpdatePromptedVersion = latestTag;
  saveConfig(cfg);

  if (!releaseUrl) return;

  if (action === "download" || action === "patch-notes") {
    await shell.openExternal(releaseUrl);
  }
}