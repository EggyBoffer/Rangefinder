import http from "http";
import https from "https";
import crypto from "crypto";
import { shell } from "electron";
import { URL } from "url";
import { addCharacter, loadEsiStore, saveEsiStore, type EsiCharacter } from "./esiStore";
import { decodeJwtPayload, extractCharacterFromJwt } from "./esiJwt";
import { getSystemById } from "../universe/universeDb";

const CLIENT_ID = "434c3ef2a1de40cfb6d5ee3b4ba8d8ee";
const REDIRECT_URI = "http://127.0.0.1:64613/callback/";

const SCOPES = [
  "esi-location.read_location.v1",
  "esi-location.read_ship_type.v1",
  "esi-skills.read_skills.v1",
];

const TOKEN_URL = "https://login.eveonline.com/v2/oauth/token";
const AUTHORIZE_URL = "https://login.eveonline.com/v2/oauth/authorize/";
const ESI_BASE = "https://esi.evetech.net/latest";

const SKILL_JUMP_DRIVE_CALIBRATION = 21611;

type ActiveLogin = { server: http.Server; startedAt: number } | null;
let activeLogin: ActiveLogin = null;

function now(): number {
  return Date.now();
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function sha256Base64url(str: string): string {
  return base64url(crypto.createHash("sha256").update(str).digest());
}

function randomBase64url(bytes: number): string {
  return base64url(crypto.randomBytes(bytes));
}

function postForm(
  url: string,
  form: Record<string, string>,
  timeoutMs = 15000
): Promise<{ status: number; json: any; raw: string }> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const body = new URLSearchParams(form || {}).toString();

      const req = https.request(
        {
          method: "POST",
          hostname: u.hostname,
          port: u.port ? Number(u.port) : 443,
          path: u.pathname + u.search,
          headers: {
            "User-Agent": "Rangefinder/0.1",
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += String(c)));
          res.on("end", () => {
            let json: any = null;
            try {
              json = JSON.parse(data);
            } catch {}
            resolve({ status: res.statusCode || 0, json, raw: data });
          });
        }
      );

      req.on("error", () => resolve({ status: 0, json: null, raw: "" }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ status: 0, json: null, raw: "" });
      });

      req.write(body);
      req.end();
    } catch {
      resolve({ status: 0, json: null, raw: "" });
    }
  });
}

function getJson(
  url: string,
  headers: Record<string, string> = {},
  timeoutMs = 12000
): Promise<{ status: number; json: any; raw: string }> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request(
        {
          method: "GET",
          hostname: u.hostname,
          port: u.port ? Number(u.port) : 443,
          path: u.pathname + u.search,
          headers: {
            "User-Agent": "Rangefinder/0.1",
            Accept: "application/json",
            ...headers,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (c) => (data += String(c)));
          res.on("end", () => {
            let json: any = null;
            try {
              json = JSON.parse(data);
            } catch {}
            resolve({ status: res.statusCode || 0, json, raw: data });
          });
        }
      );

      req.on("error", () => resolve({ status: 0, json: null, raw: "" }));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve({ status: 0, json: null, raw: "" });
      });
      req.end();
    } catch {
      resolve({ status: 0, json: null, raw: "" });
    }
  });
}

function buildAuthUrl(state: string, codeChallenge: string): string {
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", REDIRECT_URI);
  u.searchParams.set("client_id", CLIENT_ID);
  u.searchParams.set("scope", SCOPES.join(" "));
  u.searchParams.set("code_challenge", codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function startAddCharacter(): Promise<{ ok: boolean; error?: string }> {
  if (activeLogin) return { ok: false, error: "Login already in progress" };

  const cb = new URL(REDIRECT_URI);
  const listenHost = cb.hostname || "127.0.0.1";
  const listenPort = Number(cb.port || 64613);
  const listenPath = cb.pathname || "/callback/";

  const state = randomBase64url(24);
  const codeVerifier = randomBase64url(32);
  const codeChallenge = sha256Base64url(codeVerifier);

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || "", `http://${listenHost}:${listenPort}`);

        if (!reqUrl.pathname.startsWith(listenPath)) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const code = String(reqUrl.searchParams.get("code") || "");
        const returnedState = String(reqUrl.searchParams.get("state") || "");
        const error = String(reqUrl.searchParams.get("error") || "");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h3>Rangefinder</h3><p>Login cancelled.</p><p>You can close this tab.</p>");
          cleanup();
          resolve({ ok: false, error: "Login cancelled" });
          return;
        }

        if (!code || returnedState !== state) {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end("<h3>Rangefinder</h3><p>Invalid login response.</p><p>You can close this tab.</p>");
          cleanup();
          resolve({ ok: false, error: "Invalid callback" });
          return;
        }

        const tokenRes = await postForm(TOKEN_URL, {
          grant_type: "authorization_code",
          code,
          client_id: CLIENT_ID,
          code_verifier: codeVerifier,
        });

        const accessToken = String(tokenRes.json?.access_token || "");
        const refreshToken = String(tokenRes.json?.refresh_token || "");
        const expiresIn = Number(tokenRes.json?.expires_in || 0);
        const tokenType = String(tokenRes.json?.token_type || "Bearer");

        if (!accessToken || !refreshToken || !expiresIn) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h3>Rangefinder</h3><p>Login failed.</p><p>You can close this tab.</p>");
          cleanup();
          resolve({ ok: false, error: "Token exchange failed" });
          return;
        }

        const who = extractCharacterFromJwt(accessToken);
        const jwtPayload = decodeJwtPayload(accessToken) || {};
        const scopeStr = String(jwtPayload.scp || jwtPayload.scope || "");
        const tokenScopes = scopeStr
          ? scopeStr.split(" ").map((s: string) => s.trim()).filter(Boolean)
          : [...SCOPES];

        const char: EsiCharacter = {
          characterId: who?.characterId || 0,
          characterName: who?.characterName || "",
          accessToken,
          refreshToken,
          expiresAt: now() + expiresIn * 1000,
          tokenType,
          scopes: tokenScopes,
          updatedAt: now(),
        };

        if (!char.characterId) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h3>Rangefinder</h3><p>Login failed.</p><p>You can close this tab.</p>");
          cleanup();
          resolve({ ok: false, error: "Could not read character from token" });
          return;
        }

        addCharacter(char);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          `<h3>Rangefinder</h3><p>Added ${char.characterName || "character"}.</p><p>You can close this tab.</p>`
        );
        cleanup();
        resolve({ ok: true });
      } catch {
        try {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<h3>Rangefinder</h3><p>Login failed.</p><p>You can close this tab.</p>");
        } catch {}
        cleanup();
        resolve({ ok: false, error: "Login failed" });
      }
    });

    function cleanup() {
      try {
        server.close();
      } catch {}
      activeLogin = null;
    }

    server.on("error", () => {
      cleanup();
      resolve({ ok: false, error: "Could not start callback listener" });
    });

    server.listen(listenPort, listenHost, () => {
      activeLogin = { server, startedAt: now() };
      shell.openExternal(buildAuthUrl(state, codeChallenge));
    });
  });
}

async function ensureValidAccessToken(
  characterId: number
): Promise<{ ok: boolean; accessToken?: string; error?: string }> {
  const store = loadEsiStore();
  const char = store.characters.find((c) => c.characterId === characterId);
  if (!char) return { ok: false, error: "Character not found" };

  const needsRefresh = now() >= (char.expiresAt || 0) - 60000;
  if (!needsRefresh) return { ok: true, accessToken: char.accessToken };

  const tokenRes = await postForm(TOKEN_URL, {
    grant_type: "refresh_token",
    refresh_token: char.refreshToken,
    client_id: CLIENT_ID,
  });

  const accessToken = String(tokenRes.json?.access_token || "");
  const refreshToken = String(tokenRes.json?.refresh_token || "") || char.refreshToken;
  const expiresIn = Number(tokenRes.json?.expires_in || 0);
  const tokenType = String(tokenRes.json?.token_type || char.tokenType || "Bearer");

  if (!accessToken || !expiresIn) return { ok: false, error: "Refresh failed" };

  const jwtPayload = decodeJwtPayload(accessToken) || {};
  const scopeStr = String(jwtPayload.scp || jwtPayload.scope || "");
  const tokenScopes = scopeStr
    ? scopeStr.split(" ").map((s: string) => s.trim()).filter(Boolean)
    : char.scopes || [...SCOPES];

  const who =
    extractCharacterFromJwt(accessToken) || {
      characterId: char.characterId,
      characterName: char.characterName,
    };

  const updated: EsiCharacter = {
    characterId: who.characterId || char.characterId,
    characterName: who.characterName || char.characterName,
    accessToken,
    refreshToken,
    expiresAt: now() + expiresIn * 1000,
    tokenType,
    scopes: tokenScopes,
    updatedAt: now(),
  };

  store.characters = store.characters.map((c) => (c.characterId === characterId ? updated : c));
  saveEsiStore(store);

  return { ok: true, accessToken };
}

function extractSkillsArray(payload: any): any[] | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.skills)) return payload.skills;
  return null;
}

async function readSkillsJdcLevel(
  characterId: number,
  accessToken: string
): Promise<{ ok: true; jdcLevel: number } | { ok: false; error: string }> {
  const res = await getJson(`${ESI_BASE}/characters/${characterId}/skills/?datasource=tranquility`, {
    Authorization: `Bearer ${accessToken}`,
  });

  if (res.status === 0) return { ok: false, error: "Could not contact ESI (network / timeout)." };
  if (res.status >= 500) return { ok: false, error: "ESI is currently having issues. Try again in a moment." };
  if (res.status === 401) return { ok: false, error: "ESI token rejected. Remove and re-add the character." };
  if (res.status === 403) return { ok: false, error: "Missing skills scope. Remove and re-add the character." };

  if (res.json && typeof res.json.error === "string" && res.json.error.trim()) {
    return { ok: false, error: res.json.error.trim() };
  }

  const arr = extractSkillsArray(res.json);
  if (!arr) return { ok: false, error: "Could not read skills (unexpected ESI response)." };

  const row = arr.find((s: any) => Number(s?.skill_id) === SKILL_JUMP_DRIVE_CALIBRATION);
  const lvl = Number(row?.active_skill_level ?? row?.trained_skill_level ?? 0);
  const clamped = Math.max(0, Math.min(5, Math.floor(lvl)));

  return { ok: true, jdcLevel: clamped };
}

async function readTypeAndGroup(typeId: number): Promise<
  | { ok: true; typeName: string; groupId: number; groupName: string }
  | { ok: false; error: string }
> {
  const typeRes = await getJson(`${ESI_BASE}/universe/types/${typeId}/?datasource=tranquility`);
  if (typeRes.status === 0) return { ok: false, error: "Could not contact ESI (type lookup)." };
  if (typeRes.status >= 500) return { ok: false, error: "ESI is currently having issues. Try again in a moment." };

  const typeName = String(typeRes.json?.name || "").trim();
  const groupId = Number(typeRes.json?.group_id || 0);

  if (!typeName || !groupId) return { ok: false, error: "Could not resolve ship type/group." };

  const groupRes = await getJson(`${ESI_BASE}/universe/groups/${groupId}/?datasource=tranquility`);
  const groupName = String(groupRes.json?.name || "").trim();

  return { ok: true, typeName, groupId, groupName: groupName || "" };
}

export async function fetchEsiCharacterJdcLevel(
  characterId: number
): Promise<{ ok: true; characterName: string; jdcLevel: number } | { ok: false; error: string }> {
  const store = loadEsiStore();
  const char = store.characters.find((c) => c.characterId === characterId);
  if (!char) return { ok: false, error: "Character not found" };

  const tok = await ensureValidAccessToken(characterId);
  if (!tok.ok || !tok.accessToken) return { ok: false, error: tok.error || "Token invalid" };

  const sk = await readSkillsJdcLevel(characterId, tok.accessToken);
  if (!sk.ok) return { ok: false, error: sk.error };

  return { ok: true, characterName: char.characterName, jdcLevel: sk.jdcLevel };
}

export async function fetchEsiCharacterLocationShipAndSkills(
  characterId: number
): Promise<
  | {
      ok: true;
      characterName: string;
      systemId: number;
      systemName: string;
      shipTypeId: number;
      shipTypeName: string;
      shipGroupId: number;
      shipGroupName: string;
      jdcLevel: number;
    }
  | { ok: false; error: string }
> {
  const store = loadEsiStore();
  const char = store.characters.find((c) => c.characterId === characterId);
  if (!char) return { ok: false, error: "Character not found" };

  const tok = await ensureValidAccessToken(characterId);
  if (!tok.ok || !tok.accessToken) return { ok: false, error: tok.error || "Token invalid" };

  const authHeader = { Authorization: `Bearer ${tok.accessToken}` };

  const loc = await getJson(`${ESI_BASE}/characters/${characterId}/location/?datasource=tranquility`, authHeader);
  if (loc.status === 0) return { ok: false, error: "Could not contact ESI (location)." };
  if (loc.status >= 500) return { ok: false, error: "ESI is currently having issues. Try again in a moment." };
  if (loc.status === 401) return { ok: false, error: "ESI token rejected. Remove and re-add the character." };
  if (loc.status === 403) return { ok: false, error: "Missing location scope. Remove and re-add the character." };

  const systemId = Number(loc.json?.solar_system_id || 0);
  if (!systemId) return { ok: false, error: "Could not read location." };

  const ship = await getJson(`${ESI_BASE}/characters/${characterId}/ship/?datasource=tranquility`, authHeader);
  if (ship.status === 0) return { ok: false, error: "Could not contact ESI (ship)." };
  if (ship.status >= 500) return { ok: false, error: "ESI is currently having issues. Try again in a moment." };
  if (ship.status === 401) return { ok: false, error: "ESI token rejected. Remove and re-add the character." };
  if (ship.status === 403) return { ok: false, error: "Missing ship scope. Remove and re-add the character." };

  const shipTypeId = Number(ship.json?.ship_type_id || 0);
  if (!shipTypeId) {
    return {
      ok: false,
      error: "Could not read ship type. (If the character is offline, try logging into EVE once, then retry.)",
    };
  }

  const tg = await readTypeAndGroup(shipTypeId);
  if (!tg.ok) return { ok: false, error: tg.error };

  const sys = getSystemById(systemId);
  if (!sys) return { ok: false, error: "From system not found." };

  const sk = await readSkillsJdcLevel(characterId, tok.accessToken);
  if (!sk.ok) return { ok: false, error: sk.error };

  return {
    ok: true,
    characterName: char.characterName,
    systemId,
    systemName: sys.name,
    shipTypeId,
    shipTypeName: tg.typeName,
    shipGroupId: tg.groupId,
    shipGroupName: tg.groupName,
    jdcLevel: sk.jdcLevel,
  };
}
