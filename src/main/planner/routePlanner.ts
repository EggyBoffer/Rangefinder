import { calcLightyears } from "../universe/universeMath";
import { ensureGridIndex, getGridCoordsForSystem, getSystemById, getSystemsInGridRange } from "../universe/universeDb";
import { fetchSystemRegionName, fetchSystemSecurityStatus } from "../universe/esiPublic";

const LY_IN_METERS = 9460730472580800;

const FORBIDDEN_REGIONS = new Set(["pochven", "a821-a", "jzh7-f", "uu4-fa"]);

type RouteResult = { jumps: number; path: number[] } | null;

const secCache = new Map<number, number>();
const secPending = new Map<number, Promise<number | null>>();

const regionCache = new Map<number, string>();
const regionPending = new Map<number, Promise<string | null>>();

function isWormholeName(name: string): boolean {
  const n = String(name || "").trim();
  return !!n && n[0] === "J";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isForbiddenRegion(regionName: string | null): boolean {
  const n = String(regionName || "").trim().toLowerCase();
  if (!n) return false;
  return FORBIDDEN_REGIONS.has(n);
}

function secToOneDecimalRound(sec: number): number {
  return Math.round(sec * 10) / 10;
}

function isCynoAllowed(sec: number | null): boolean {
  if (typeof sec !== "number" || !Number.isFinite(sec)) return false;
  return secToOneDecimalRound(sec) <= 0.4;
}

async function fetchSecWithRetry(id: number): Promise<number | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await fetchSystemSecurityStatus(id);
    if (typeof v === "number" && Number.isFinite(v)) return v;
    await sleep(120 + attempt * 180);
  }
  return null;
}

async function getSec(id: number): Promise<number | null> {
  const cached = secCache.get(id);
  if (typeof cached === "number") return cached;

  const pending = secPending.get(id);
  if (pending) return pending;

  const p = fetchSecWithRetry(id).then((v) => {
    secPending.delete(id);
    if (typeof v === "number" && Number.isFinite(v)) secCache.set(id, v);
    return v;
  });

  secPending.set(id, p);
  return p;
}

async function fetchRegionWithRetry(id: number): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = await fetchSystemRegionName(id);
    const n = String(v || "").trim();
    if (n) return n;
    await sleep(120 + attempt * 180);
  }
  return null;
}

async function getRegionName(id: number): Promise<string | null> {
  const cached = regionCache.get(id);
  if (typeof cached === "string") return cached;

  const pending = regionPending.get(id);
  if (pending) return pending;

  const p = fetchRegionWithRetry(id).then((v) => {
    regionPending.delete(id);
    const n = String(v || "").trim();
    if (n) regionCache.set(id, n);
    return n || null;
  });

  regionPending.set(id, p);
  return p;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(items.length) as any;
  let i = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const idx = i++;
      if (idx >= items.length) return;
      res[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return res;
}

function rebuildPath(parents: Map<number, number | null>, endId: number): number[] {
  const path: number[] = [];
  let cur: number | null = endId;

  while (cur !== null) {
    path.push(cur);
    cur = parents.get(cur) ?? null;
  }

  path.reverse();
  return path;
}

async function getNeighbors(fromId: number, maxLy: number): Promise<number[]> {
  const from = getSystemById(fromId);
  if (!from) return [];

  const bucketMeters = (maxLy * LY_IN_METERS) / 2;
  ensureGridIndex(bucketMeters);

  const g = getGridCoordsForSystem(fromId);
  if (!g) return [];

  const candidates = getSystemsInGridRange(g.gx, g.gy, g.gz, 14);

  const within: number[] = [];
  for (const cand of candidates) {
    if (cand.id === fromId) continue;
    if (isWormholeName(cand.name)) continue;

    const dly = calcLightyears(from.x, from.y, from.z, cand.x, cand.y, cand.z);
    if (dly <= maxLy) within.push(cand.id);
  }

  if (!within.length) return [];

  const rows = await mapLimit(within, 12, async (id) => {
    const [sec, regionName] = await Promise.all([getSec(id), getRegionName(id)]);
    return { id, sec, regionName };
  });

  const out: number[] = [];
  for (const r of rows) {
    if (!isCynoAllowed(r.sec)) continue;
    if (isForbiddenRegion(r.regionName)) continue;
    out.push(r.id);
  }

  return out;
}

export async function findRouteESI(fromId: number, toId: number, maxLy: number, maxDepth: number): Promise<RouteResult> {
  const [toSec, toRegion] = await Promise.all([getSec(toId), getRegionName(toId)]);
  if (!isCynoAllowed(toSec)) return null;
  if (isForbiddenRegion(toRegion)) return null;

  const q: Array<{ id: number; depth: number }> = [{ id: fromId, depth: 0 }];
  const seen = new Set<number>([fromId]);
  const parents = new Map<number, number | null>();
  parents.set(fromId, null);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.depth >= maxDepth) continue;

    const neigh = await getNeighbors(cur.id, maxLy);

    for (const nid of neigh) {
      if (seen.has(nid)) continue;

      parents.set(nid, cur.id);

      if (nid === toId) {
        const path = rebuildPath(parents, toId);
        return { jumps: path.length - 1, path };
      }

      seen.add(nid);
      q.push({ id: nid, depth: cur.depth + 1 });
    }
  }

  return null;
}
