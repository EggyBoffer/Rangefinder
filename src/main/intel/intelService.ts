import { app } from "electron";
import { getSystemById } from "../universe/universeDb";

export type IntelEntry = {
  kind: "kill" | "loss";
  killmailId: number;
  killmailHash: string;
  time: string;
  systemId: number | null;
  systemName: string;
  totalValue: number | null;
  zkillUrl: string;
};

export type KillmailEnriched = {
  ok: true;
  killmailId: number;
  victimName: string;
  victimShipTypeId: number | null;
  victimShipName: string;
  yourShipTypeId: number | null;
  yourShipName: string;
  topAttackerName: string;
  topAttackerShipTypeId: number | null;
  topAttackerShipName: string;
};

export type IntelResult =
  | {
      ok: true;
      characterId: number;
      characterName: string;
      corporationName: string | null;
      allianceName: string | null;
      entries: IntelEntry[];
      zkillUrl: string;
    }
  | { ok: false; error: string };

const NAME_TTL_MS = 24 * 60 * 60 * 1000;
const META_TTL_MS = 24 * 60 * 60 * 1000;
const INTEL_TTL_MS = 5 * 60 * 1000;
const KILLMAIL_TTL_MS = 30 * 60 * 1000;
const NAME_RESOLVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TYPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const nameCache = new Map<string, { characterId: number; ts: number; name: string }>();
const intelCache = new Map<number, { result: IntelResult; ts: number }>();
const metaCache = new Map<number, { corporationName: string | null; allianceName: string | null; ts: number }>();

const killmailCache = new Map<string, { result: KillmailEnriched | { ok: false; error: string }; ts: number }>();
const idNameCache = new Map<number, { name: string; ts: number }>();
const typeNameCache = new Map<number, { name: string; ts: number }>();

let zkillNextAllowed = 0;
let zkillInFlight: Promise<any> | null = null;

let esiNextAllowed = 0;
let esiInFlight: Promise<any> | null = null;

function nowMs(): number {
  return Date.now();
}

function safeString(v: any): string {
  return String(v ?? "").trim();
}

function normalizeName(name: string): string {
  return safeString(name).replace(/\s+/g, " ").trim();
}

function clampEntries(items: any[], limit: number): any[] {
  const lim = Math.max(1, Math.min(50, Math.floor(limit)));
  return items.slice(0, lim);
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 9000): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...(init || {}), signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      const msg = `HTTP ${res.status} ${res.statusText}`;
      throw new Error(text ? `${msg}: ${text.slice(0, 240)}` : msg);
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  } finally {
    clearTimeout(t);
  }
}

async function resolveCharacterIdByName(
  name: string
): Promise<{ ok: true; characterId: number; canonicalName: string } | { ok: false; error: string }> {
  const q = normalizeName(name);
  if (!q) return { ok: false, error: "Missing character name" };

  const cached = nameCache.get(q.toLowerCase());
  if (cached && nowMs() - cached.ts < NAME_TTL_MS) {
    return { ok: true, characterId: cached.characterId, canonicalName: cached.name };
  }

  try {
    const ids = await fetchJson("https://esi.evetech.net/latest/universe/ids/?datasource=tranquility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([q]),
    });

    const chars = Array.isArray(ids?.characters) ? ids.characters : [];
    if (chars.length) {
      const c = chars[0];
      const characterId = Number(c?.id);
      const canonicalName = safeString(c?.name) || q;
      if (Number.isFinite(characterId) && characterId > 0) {
        nameCache.set(q.toLowerCase(), { characterId, ts: nowMs(), name: canonicalName });
        return { ok: true, characterId, canonicalName };
      }
    }
  } catch {}

  try {
    const url = `https://esi.evetech.net/latest/search/?categories=character&datasource=tranquility&language=en&search=${encodeURIComponent(
      q
    )}&strict=true`;
    const data = await fetchJson(url, undefined, 9000);
    const arr = Array.isArray(data?.character) ? data.character : [];
    if (arr.length) {
      const characterId = Number(arr[0]);
      if (Number.isFinite(characterId) && characterId > 0) {
        nameCache.set(q.toLowerCase(), { characterId, ts: nowMs(), name: q });
        return { ok: true, characterId, canonicalName: q };
      }
    }
  } catch {}

  return { ok: false, error: "Character not found" };
}

function buildZkillUrlForCharacter(characterId: number): string {
  return `https://zkillboard.com/character/${characterId}/`;
}

function buildZkillUrlForKill(killmailId: number): string {
  return `https://zkillboard.com/kill/${killmailId}/`;
}

function ua(): string {
  const v = safeString(app.getVersion());
  return `Rangefinder/${v || "dev"} (+intel)`;
}

async function rateLimitZkill<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, zkillNextAllowed - nowMs());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    zkillNextAllowed = nowMs() + 900;
    return fn();
  };

  if (!zkillInFlight) {
    zkillInFlight = run().finally(() => {
      zkillInFlight = null;
    });
    return zkillInFlight as any;
  }

  zkillInFlight = zkillInFlight.then(run, run).finally(() => {
    zkillInFlight = null;
  });
  return zkillInFlight as any;
}

async function rateLimitEsi<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, esiNextAllowed - nowMs());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    esiNextAllowed = nowMs() + 180;
    return fn();
  };

  if (!esiInFlight) {
    esiInFlight = run().finally(() => {
      esiInFlight = null;
    });
    return esiInFlight as any;
  }

  esiInFlight = esiInFlight.then(run, run).finally(() => {
    esiInFlight = null;
  });
  return esiInFlight as any;
}

async function fetchZkillKills(characterId: number): Promise<any[]> {
  const url = `https://zkillboard.com/api/kills/characterID/${characterId}/`;
  const data = await rateLimitZkill(() =>
    fetchJson(url, {
      headers: {
        "User-Agent": ua(),
        Accept: "application/json",
      },
    })
  );
  return Array.isArray(data) ? data : [];
}

async function fetchZkillLosses(characterId: number): Promise<any[]> {
  const url = `https://zkillboard.com/api/losses/characterID/${characterId}/`;
  const data = await rateLimitZkill(() =>
    fetchJson(url, {
      headers: {
        "User-Agent": ua(),
        Accept: "application/json",
      },
    })
  );
  return Array.isArray(data) ? data : [];
}

function parseTime(v: any): string {
  const s = safeString(v);
  if (!s) return "";
  return s.replace("T", " ").replace("Z", "").trim();
}

function systemNameFromId(id: number | null): string {
  if (!id || !Number.isFinite(id)) return "-";
  const sys = getSystemById(id);
  return (sys as any)?.name || `System ${id}`;
}

function toEntry(kind: "kill" | "loss", item: any): IntelEntry | null {
  const killmailId = Number(item?.killmail_id);
  const killmailHash = safeString(item?.zkb?.hash);
  if (!Number.isFinite(killmailId) || killmailId <= 0 || !killmailHash) return null;

  const systemId = Number(item?.solar_system_id);
  const time = parseTime(item?.killmail_time);
  const totalValue = Number(item?.zkb?.totalValue);

  return {
    kind,
    killmailId,
    killmailHash,
    time: time || "-",
    systemId: Number.isFinite(systemId) ? systemId : null,
    systemName: systemNameFromId(Number.isFinite(systemId) ? systemId : null),
    totalValue: Number.isFinite(totalValue) ? totalValue : null,
    zkillUrl: buildZkillUrlForKill(killmailId),
  };
}

function mergeAndSort(kills: any[], losses: any[]): IntelEntry[] {
  const seen = new Set<number>();
  const out: IntelEntry[] = [];

  for (const k of kills || []) {
    const e = toEntry("kill", k);
    if (!e) continue;
    if (!seen.has(e.killmailId)) {
      seen.add(e.killmailId);
      out.push(e);
    }
  }

  for (const l of losses || []) {
    const e = toEntry("loss", l);
    if (!e) continue;
    if (!seen.has(e.killmailId)) {
      seen.add(e.killmailId);
      out.push(e);
    }
  }

  out.sort((a, b) => {
    const ta = Date.parse(String(a.time).replace(" ", "T") + "Z");
    const tb = Date.parse(String(b.time).replace(" ", "T") + "Z");
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    return String(b.time).localeCompare(String(a.time));
  });

  return out;
}

async function resolveNames(ids: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const unique = Array.from(new Set(ids.filter((n) => Number.isFinite(n) && n > 0)));

  const missing: number[] = [];
  for (const id of unique) {
    const cached = idNameCache.get(id);
    if (cached && nowMs() - cached.ts < NAME_RESOLVE_TTL_MS) out.set(id, cached.name);
    else missing.push(id);
  }

  if (!missing.length) return out;

  const chunks: number[][] = [];
  for (let i = 0; i < missing.length; i += 50) chunks.push(missing.slice(i, i + 50));

  for (const chunk of chunks) {
    try {
      const data = await rateLimitEsi(() =>
        fetchJson("https://esi.evetech.net/latest/universe/names/?datasource=tranquility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chunk),
        })
      );

      const arr = Array.isArray(data) ? data : [];
      for (const it of arr) {
        const id = Number(it?.id);
        const name = safeString(it?.name);
        if (Number.isFinite(id) && id > 0 && name) {
          idNameCache.set(id, { name, ts: nowMs() });
          out.set(id, name);
        }
      }
    } catch {}
  }

  return out;
}

async function fetchCharacterPublicMeta(
  characterId: number
): Promise<{ corporationId: number | null; allianceId: number | null }> {
  const url = `https://esi.evetech.net/latest/characters/${characterId}/?datasource=tranquility`;
  const data = await rateLimitEsi(() => fetchJson(url, undefined, 9000));
  const corp = Number(data?.corporation_id);
  const alli = Number(data?.alliance_id);
  return {
    corporationId: Number.isFinite(corp) && corp > 0 ? corp : null,
    allianceId: Number.isFinite(alli) && alli > 0 ? alli : null,
  };
}

async function getCharacterMetaNames(
  characterId: number
): Promise<{ corporationName: string | null; allianceName: string | null }> {
  const cached = metaCache.get(characterId);
  if (cached && nowMs() - cached.ts < META_TTL_MS) {
    return { corporationName: cached.corporationName, allianceName: cached.allianceName };
  }

  try {
    const ids = await fetchCharacterPublicMeta(characterId);
    const toResolve: number[] = [];
    if (ids.corporationId) toResolve.push(ids.corporationId);
    if (ids.allianceId) toResolve.push(ids.allianceId);

    const names = toResolve.length ? await resolveNames(toResolve) : new Map<number, string>();

    const corporationName = ids.corporationId ? names.get(ids.corporationId) || `Corporation ${ids.corporationId}` : null;
    const allianceName = ids.allianceId ? names.get(ids.allianceId) || `Alliance ${ids.allianceId}` : null;

    metaCache.set(characterId, { corporationName, allianceName, ts: nowMs() });
    return { corporationName, allianceName };
  } catch {
    metaCache.set(characterId, { corporationName: null, allianceName: null, ts: nowMs() });
    return { corporationName: null, allianceName: null };
  }
}

export async function lookupCharacterIntel(name: string): Promise<IntelResult> {
  const resolved = await resolveCharacterIdByName(name);
  if (!resolved.ok) return { ok: false, error: resolved.error };

  const cached = intelCache.get(resolved.characterId);
  if (cached && nowMs() - cached.ts < INTEL_TTL_MS) {
    return cached.result;
  }

  const zurl = buildZkillUrlForCharacter(resolved.characterId);

  try {
    const meta = await getCharacterMetaNames(resolved.characterId);

    const [kills, losses] = await Promise.all([
      fetchZkillKills(resolved.characterId),
      fetchZkillLosses(resolved.characterId),
    ]);

    const entries = clampEntries(mergeAndSort(kills, losses), 20);

    const result: IntelResult = {
      ok: true,
      characterId: resolved.characterId,
      characterName: resolved.canonicalName,
      corporationName: meta.corporationName,
      allianceName: meta.allianceName,
      entries,
      zkillUrl: zurl,
    };

    intelCache.set(resolved.characterId, { result, ts: nowMs() });
    return result;
  } catch (err: any) {
    const msg = safeString(err?.message) || "zKillboard request failed";
    const result: IntelResult = { ok: false, error: `${msg}. You can still open zKillboard directly.` };
    intelCache.set(resolved.characterId, { result, ts: nowMs() });
    return result;
  }
}

async function fetchKillmail(killmailId: number, killmailHash: string): Promise<any> {
  const url = `https://esi.evetech.net/latest/killmails/${killmailId}/${encodeURIComponent(
    killmailHash
  )}/?datasource=tranquility`;
  return rateLimitEsi(() => fetchJson(url, undefined, 10000));
}

async function resolveTypeName(typeId: number | null): Promise<string> {
  if (!typeId || !Number.isFinite(typeId) || typeId <= 0) return "-";
  const cached = typeNameCache.get(typeId);
  if (cached && nowMs() - cached.ts < TYPE_TTL_MS) return cached.name;

  try {
    const url = `https://esi.evetech.net/latest/universe/types/${typeId}/?datasource=tranquility&language=en`;
    const data = await rateLimitEsi(() => fetchJson(url, undefined, 9000));
    const name = safeString(data?.name);
    if (name) {
      typeNameCache.set(typeId, { name, ts: nowMs() });
      return name;
    }
  } catch {}

  return `Type ${typeId}`;
}

function pickYourShipTypeId(killmail: any, characterId: number): number | null {
  const victimChar = Number(killmail?.victim?.character_id);
  const victimShip = Number(killmail?.victim?.ship_type_id);

  if (Number.isFinite(victimChar) && victimChar === characterId) {
    return Number.isFinite(victimShip) ? victimShip : null;
  }

  const attackers = Array.isArray(killmail?.attackers) ? killmail.attackers : [];
  for (const a of attackers) {
    const cid = Number(a?.character_id);
    if (Number.isFinite(cid) && cid === characterId) {
      const st = Number(a?.ship_type_id);
      return Number.isFinite(st) ? st : null;
    }
  }

  return null;
}

function pickTopAttacker(killmail: any): { attackerId: number | null; shipTypeId: number | null } {
  const attackers = Array.isArray(killmail?.attackers) ? killmail.attackers : [];
  let best: any = null;
  let bestDmg = -1;

  for (const a of attackers) {
    const dmg = Number(a?.damage_done);
    if (!Number.isFinite(dmg)) continue;
    if (dmg > bestDmg) {
      bestDmg = dmg;
      best = a;
    }
  }

  if (!best) return { attackerId: null, shipTypeId: null };

  const attackerId = Number(best?.character_id);
  const shipTypeId = Number(best?.ship_type_id);

  return {
    attackerId: Number.isFinite(attackerId) ? attackerId : null,
    shipTypeId: Number.isFinite(shipTypeId) ? shipTypeId : null,
  };
}

export async function getKillmailEnriched(
  killmailId: number,
  killmailHash: string,
  characterId: number
): Promise<KillmailEnriched | { ok: false; error: string }> {
  const kmid = Number(killmailId);
  const hash = safeString(killmailHash);
  const cid = Number(characterId);

  if (!Number.isFinite(kmid) || kmid <= 0 || !hash) return { ok: false, error: "Missing killmail details" };
  if (!Number.isFinite(cid) || cid <= 0) return { ok: false, error: "Missing character id" };

  const cacheKey = `${kmid}:${cid}`;

  const cached = killmailCache.get(cacheKey);
  if (cached && nowMs() - cached.ts < KILLMAIL_TTL_MS) return cached.result;

  try {
    const km = await fetchKillmail(kmid, hash);

    const victimId = Number(km?.victim?.character_id);
    const victimShipTypeId = Number(km?.victim?.ship_type_id);
    const victimShipId = Number.isFinite(victimShipTypeId) ? victimShipTypeId : null;

    const yourShipId = pickYourShipTypeId(km, cid);

    const top = pickTopAttacker(km);
    const topAttackerId = top.attackerId;
    const topAttackerShipId = top.shipTypeId;

    const nameIds: number[] = [];
    if (Number.isFinite(victimId) && victimId > 0) nameIds.push(victimId);
    if (topAttackerId && Number.isFinite(topAttackerId) && topAttackerId > 0) nameIds.push(topAttackerId);

    const names = nameIds.length ? await resolveNames(nameIds) : new Map<number, string>();

    const victimName =
      names.get(victimId) || (Number.isFinite(victimId) && victimId > 0 ? `Character ${victimId}` : "-");

    const topAttackerName =
      (topAttackerId ? names.get(topAttackerId) : null) ||
      (topAttackerId ? `Character ${topAttackerId}` : "-");

    const [victimShipName, yourShipName, topAttackerShipName] = await Promise.all([
      resolveTypeName(victimShipId),
      resolveTypeName(yourShipId),
      resolveTypeName(topAttackerShipId),
    ]);

    const result: KillmailEnriched = {
      ok: true,
      killmailId: kmid,
      victimName,
      victimShipTypeId: victimShipId,
      victimShipName,
      yourShipTypeId: yourShipId,
      yourShipName,
      topAttackerName,
      topAttackerShipTypeId: topAttackerShipId,
      topAttackerShipName,
    };

    killmailCache.set(cacheKey, { result, ts: nowMs() });
    return result;
  } catch (err: any) {
    const msg = safeString(err?.message) || "ESI killmail lookup failed";
    const result = { ok: false as const, error: msg };
    killmailCache.set(cacheKey, { result, ts: nowMs() });
    return result;
  }
}