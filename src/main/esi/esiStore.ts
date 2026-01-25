import { app } from "electron";
import fs from "fs";
import path from "path";

export type EsiCharacter = {
  characterId: number;
  characterName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scopes: string[];
  updatedAt: number;
};

export type EsiStore = {
  characters: EsiCharacter[];
  activeCharacterId: number | null;
};

const STORE_PATH = path.join(app.getPath("userData"), "esi.json");

function emptyStore(): EsiStore {
  return { characters: [], activeCharacterId: null };
}

function normalizeStore(parsed: any): EsiStore {
  const charsRaw = Array.isArray(parsed?.characters) ? parsed.characters : [];
  const characters: EsiCharacter[] = charsRaw
    .map((c: any) => ({
      characterId: Number(c?.characterId) || 0,
      characterName: String(c?.characterName || ""),
      accessToken: String(c?.accessToken || ""),
      refreshToken: String(c?.refreshToken || ""),
      expiresAt: Number(c?.expiresAt) || 0,
      tokenType: String(c?.tokenType || "Bearer"),
      scopes: Array.isArray(c?.scopes) ? c.scopes.map((s: any) => String(s)).filter(Boolean) : [],
      updatedAt: Number(c?.updatedAt) || 0,
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

export function loadEsiStore(): EsiStore {
  try {
    if (!fs.existsSync(STORE_PATH)) return emptyStore();
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeStore(parsed);
  } catch {
    return emptyStore();
  }
}

export function saveEsiStore(store: EsiStore): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function addCharacter(char: EsiCharacter): EsiStore {
  const store = loadEsiStore();
  store.characters = store.characters.filter((c) => c.characterId !== char.characterId);
  store.characters.push(char);
  if (!store.activeCharacterId) store.activeCharacterId = char.characterId;
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
