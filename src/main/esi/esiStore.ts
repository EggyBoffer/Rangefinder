import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

export type EsiAuthStatus = "unknown" | "valid" | "expired";

export type EsiCharacter = {
  characterId: number;
  characterName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scopes: string[];
  updatedAt: number;
  authStatus?: EsiAuthStatus;
  authMessage?: string;
  authCheckedAt?: number;
};

export type EsiStore = {
  characters: EsiCharacter[];
  activeCharacterId: number | null;
};

type StoredEsiCharacter = Partial<EsiCharacter> & {
  accessTokenEncrypted?: string;
  refreshTokenEncrypted?: string;
};

type StoredEsiStore = {
  version?: number;
  encryption?: "safeStorage" | "none";
  characters?: StoredEsiCharacter[];
  activeCharacterId?: number | null;
};

function getStorePath(): string {
  return path.join(app.getPath("userData"), "esi.json");
}

function getLegacyStorePaths(): string[] {
  const current = getStorePath();
  const paths: string[] = [];
  const appData = process.env.APPDATA || "";
  if (appData) {
    paths.push(path.join(appData, "rangefinder", "esi.json"));
    paths.push(path.join(appData, "Rangefinder", "esi.json"));
  }
  return Array.from(new Set(paths.filter((p) => p && p !== current)));
}

function emptyStore(): EsiStore {
  return { characters: [], activeCharacterId: null };
}

function normalizeAuthStatus(v: any): EsiAuthStatus {
  const s = String(v || "").trim().toLowerCase();
  if (s === "valid" || s === "expired") return s;
  return "unknown";
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function encryptToken(value: string): string | null {
  const token = String(value || "");
  if (!token || !encryptionAvailable()) return null;

  try {
    return safeStorage.encryptString(token).toString("base64");
  } catch {
    return null;
  }
}

function decryptToken(value: any): string {
  const encrypted = String(value || "");
  if (!encrypted || !encryptionAvailable()) return "";

  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return "";
  }
}

function readToken(
  c: StoredEsiCharacter,
  plainKey: "accessToken" | "refreshToken",
  encryptedKey: "accessTokenEncrypted" | "refreshTokenEncrypted"
): string {
  const encrypted = decryptToken(c[encryptedKey]);
  if (encrypted) return encrypted;
  return String(c[plainKey] || "");
}

function normalizeStore(parsed: any): EsiStore {
  const charsRaw = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const characters: EsiCharacter[] = charsRaw
    .map((c: StoredEsiCharacter) => ({
      characterId: Number(c?.characterId) || 0,
      characterName: String(c?.characterName || ""),
      accessToken: readToken(c, "accessToken", "accessTokenEncrypted"),
      refreshToken: readToken(c, "refreshToken", "refreshTokenEncrypted"),
      expiresAt: Number(c?.expiresAt) || 0,
      tokenType: String(c?.tokenType || "Bearer"),
      scopes: Array.isArray(c?.scopes) ? c.scopes.map((s: any) => String(s)).filter(Boolean) : [],
      updatedAt: Number(c?.updatedAt) || 0,
      authStatus: normalizeAuthStatus(c?.authStatus),
      authMessage: String(c?.authMessage || ""),
      authCheckedAt: Number(c?.authCheckedAt) || 0,
    }))
    .filter((c: EsiCharacter) => c.characterId > 0 && !!c.refreshToken);

  let activeCharacterId: number | null =
    typeof parsed?.activeCharacterId === "number" ? parsed.activeCharacterId : null;

  if (activeCharacterId && !characters.some((c) => c.characterId === activeCharacterId)) {
    activeCharacterId = null;
  }
  if (!activeCharacterId && characters.length) activeCharacterId = characters[0].characterId;

  return { characters, activeCharacterId };
}

function serializeStore(store: EsiStore): StoredEsiStore {
  const normalized = normalizeStore(store);
  const canEncrypt = encryptionAvailable();

  return {
    version: 2,
    encryption: canEncrypt ? "safeStorage" : "none",
    activeCharacterId: normalized.activeCharacterId,
    characters: normalized.characters.map((c) => {
      const accessTokenEncrypted = encryptToken(c.accessToken);
      const refreshTokenEncrypted = encryptToken(c.refreshToken);

      const stored: StoredEsiCharacter = {
        characterId: c.characterId,
        characterName: c.characterName,
        expiresAt: c.expiresAt,
        tokenType: c.tokenType,
        scopes: c.scopes,
        updatedAt: c.updatedAt,
        authStatus: normalizeAuthStatus(c.authStatus),
        authMessage: String(c.authMessage || ""),
        authCheckedAt: Number(c.authCheckedAt) || 0,
      };

      if (canEncrypt && accessTokenEncrypted && refreshTokenEncrypted) {
        stored.accessTokenEncrypted = accessTokenEncrypted;
        stored.refreshTokenEncrypted = refreshTokenEncrypted;
      } else {
        stored.accessToken = c.accessToken;
        stored.refreshToken = c.refreshToken;
      }

      return stored;
    }),
  };
}

function tryLoadStoreFile(p: string): EsiStore | null {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch {
    return null;
  }
}

export function loadEsiStore(): EsiStore {
  const current = getStorePath();
  const currentStore = tryLoadStoreFile(current);
  if (currentStore) return currentStore;

  for (const legacyPath of getLegacyStorePaths()) {
    const legacyStore = tryLoadStoreFile(legacyPath);
    if (legacyStore && legacyStore.characters.length) {
      saveEsiStore(legacyStore);
      return legacyStore;
    }
  }

  return emptyStore();
}

export function saveEsiStore(store: EsiStore): void {
  const p = getStorePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(serializeStore(store), null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

export function addCharacter(char: EsiCharacter): EsiStore {
  const store = loadEsiStore();
  const cleanChar: EsiCharacter = {
    ...char,
    authStatus: char.authStatus || "valid",
    authMessage: char.authMessage || "ESI key is valid.",
    authCheckedAt: char.authCheckedAt || Date.now(),
  };
  store.characters = store.characters.filter((c) => c.characterId !== cleanChar.characterId);
  store.characters.push(cleanChar);
  if (!store.activeCharacterId) store.activeCharacterId = cleanChar.characterId;
  saveEsiStore(store);
  return store;
}

export function removeCharacter(characterId: number): EsiStore {
  const store = loadEsiStore();
  store.characters = store.characters.filter((c) => c.characterId !== characterId);
  if (store.activeCharacterId === characterId) {
    store.activeCharacterId = store.characters[0]?.characterId ?? null;
  }
  saveEsiStore(store);
  return store;
}

export function setActiveCharacter(characterId: number): EsiStore {
  const store = loadEsiStore();
  if (store.characters.some((c) => c.characterId === characterId)) {
    store.activeCharacterId = characterId;
    saveEsiStore(store);
  }
  return store;
}

export function updateCharacterAuthStatus(
  characterId: number,
  authStatus: EsiAuthStatus,
  authMessage: string
): EsiStore {
  const store = loadEsiStore();
  const checkedAt = Date.now();
  store.characters = store.characters.map((c) =>
    c.characterId === characterId
      ? {
          ...c,
          authStatus,
          authMessage,
          authCheckedAt: checkedAt,
        }
      : c
  );
  saveEsiStore(store);
  return store;
}