import https from "https";

type CacheEntryNum = { v: number; ts: number };
type CacheEntryStr = { v: string; ts: number };

const TTL_MS = 1000 * 60 * 60 * 24 * 30;

const secCache = new Map<number, CacheEntryNum>();

const systemConstellationCache = new Map<number, CacheEntryNum>();
const constellationRegionCache = new Map<number, CacheEntryNum>();

const regionNameByIdCache = new Map<number, CacheEntryStr>();
const systemRegionNameCache = new Map<number, CacheEntryStr>();

function now(): number {
  return Date.now();
}

function getNum(map: Map<number, CacheEntryNum>, key: number): number | null {
  const e = map.get(key);
  if (!e) return null;
  if (now() - e.ts > TTL_MS) {
    map.delete(key);
    return null;
  }
  return e.v;
}

function setNum(map: Map<number, CacheEntryNum>, key: number, v: number): void {
  map.set(key, { v, ts: now() });
}

function getStr(map: Map<number, CacheEntryStr>, key: number): string | null {
  const e = map.get(key);
  if (!e) return null;
  if (now() - e.ts > TTL_MS) {
    map.delete(key);
    return null;
  }
  return e.v;
}

function setStr(map: Map<number, CacheEntryStr>, key: number, v: string): void {
  map.set(key, { v, ts: now() });
}

function fetchJson(url: string): Promise<any | null> {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "Rangefinder/0.1 (Universe lookup)",
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
              return;
            } catch {
              resolve(null);
              return;
            }
          }
          resolve(null);
        });
      }
    );

    req.on("error", () => resolve(null));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

export async function fetchSystemSecurityStatus(systemId: number): Promise<number | null> {
  const cached = getNum(secCache, systemId);
  if (cached !== null) return cached;

  const url = `https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`;
  const json = await fetchJson(url);
  const sec = Number(json?.security_status);

  if (Number.isFinite(sec)) {
    setNum(secCache, systemId, sec);
    return sec;
  }

  return null;
}

async function fetchSystemConstellationId(systemId: number): Promise<number | null> {
  const cached = getNum(systemConstellationCache, systemId);
  if (cached !== null) return cached;

  const url = `https://esi.evetech.net/latest/universe/systems/${systemId}/?datasource=tranquility`;
  const json = await fetchJson(url);
  const cid = Number(json?.constellation_id);

  if (Number.isFinite(cid)) {
    setNum(systemConstellationCache, systemId, cid);
    return cid;
  }

  return null;
}

async function fetchConstellationRegionId(constellationId: number): Promise<number | null> {
  const cached = getNum(constellationRegionCache, constellationId);
  if (cached !== null) return cached;

  const url = `https://esi.evetech.net/latest/universe/constellations/${constellationId}/?datasource=tranquility`;
  const json = await fetchJson(url);
  const rid = Number(json?.region_id);

  if (Number.isFinite(rid)) {
    setNum(constellationRegionCache, constellationId, rid);
    return rid;
  }

  return null;
}

async function fetchRegionName(regionId: number): Promise<string | null> {
  const cached = getStr(regionNameByIdCache, regionId);
  if (cached !== null) return cached;

  const url = `https://esi.evetech.net/latest/universe/regions/${regionId}/?datasource=tranquility`;
  const json = await fetchJson(url);
  const name = String(json?.name || "").trim();

  if (name) {
    setStr(regionNameByIdCache, regionId, name);
    return name;
  }

  return null;
}

export async function fetchSystemRegionName(systemId: number): Promise<string | null> {
  const cached = getStr(systemRegionNameCache, systemId);
  if (cached !== null) return cached;

  const cid = await fetchSystemConstellationId(systemId);
  if (!cid) return null;

  const rid = await fetchConstellationRegionId(cid);
  if (!rid) return null;

  const rname = await fetchRegionName(rid);
  if (!rname) return null;

  setStr(systemRegionNameCache, systemId, rname);
  return rname;
}
