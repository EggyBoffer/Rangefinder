import { calcLightyears } from "../universe/universeMath";
import { ensureGridIndex, getGridCoordsForSystem, getSystemById, getSystemsInGridRange } from "../universe/universeDb";
import { fetchSystemRegionName, fetchSystemSecurityStatus } from "../universe/esiPublic";

const LY_IN_METERS = 9460730472580800;

const FORBIDDEN_REGIONS = new Set(["pochven", "a821-a", "j7hz-f", "uua-f4"]);

type RouteResult = { jumps: number; path: number[] } | null;

const secCache = new Map<number, number>();
const secPending = new Map<number, Promise<number | null>>();

const regionCache = new Map<number, string>();
const regionPending = new Map<number, Promise<string | null>>();

const ROUTE_CACHE_TTL_MS = 10 * 60 * 1000;
const ROUTE_CACHE_MAX = 600;

const routeCache = new Map<string, { t: number; r: RouteResult }>();

function nowMs(): number {
  return Date.now();
}

function routeKey(fromId: number, toId: number, maxLy: number, maxDepth: number): string {
  const ly10 = Math.round(maxLy * 10);
  return `${fromId}|${toId}|${ly10}|${maxDepth}`;
}

function cacheGet(key: string): RouteResult | undefined {
  const v = routeCache.get(key);
  if (!v) return undefined;
  if (nowMs() - v.t > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return undefined;
  }
  routeCache.delete(key);
  routeCache.set(key, v);
  return v.r;
}

function cacheSet(key: string, r: RouteResult): void {
  routeCache.set(key, { t: nowMs(), r });
  if (routeCache.size <= ROUTE_CACHE_MAX) return;
  const oldestKey = routeCache.keys().next().value as string | undefined;
  if (oldestKey) routeCache.delete(oldestKey);
}

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

type HeapItem = { id: number; depth: number; score: number };

function heapPush(heap: HeapItem[], item: HeapItem): void {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p].score <= heap[i].score) break;
    const tmp = heap[p];
    heap[p] = heap[i];
    heap[i] = tmp;
    i = p;
  }
}

function heapPop(heap: HeapItem[]): HeapItem | undefined {
  const n = heap.length;
  if (!n) return undefined;
  const top = heap[0];
  const last = heap.pop() as HeapItem;
  if (n > 1) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l].score < heap[m].score) m = l;
      if (r < heap.length && heap[r].score < heap[m].score) m = r;
      if (m === i) break;
      const tmp = heap[m];
      heap[m] = heap[i];
      heap[i] = tmp;
      i = m;
    }
  }
  return top;
}

function estimateRemainingHops(fromId: number, toId: number, maxLy: number): number {
  const a = getSystemById(fromId);
  const b = getSystemById(toId);
  if (!a || !b) return 0;
  const d = calcLightyears(a.x, a.y, a.z, b.x, b.y, b.z);
  if (!Number.isFinite(d) || d <= 0) return 0;
  if (!Number.isFinite(maxLy) || maxLy <= 0) return 0;
  return d / maxLy;
}

export async function findRouteESI(fromId: number, toId: number, maxLy: number, maxDepth: number): Promise<RouteResult> {
  if (fromId === toId) return { jumps: 0, path: [fromId] };

  const key = routeKey(fromId, toId, maxLy, maxDepth);
  const cached = cacheGet(key);
  if (typeof cached !== "undefined") return cached;

  const [toSec, toRegion] = await Promise.all([getSec(toId), getRegionName(toId)]);
  if (!isCynoAllowed(toSec)) {
    cacheSet(key, null);
    return null;
  }
  if (isForbiddenRegion(toRegion)) {
    cacheSet(key, null);
    return null;
  }

  const parents = new Map<number, number | null>();
  parents.set(fromId, null);

  const bestDepth = new Map<number, number>();
  bestDepth.set(fromId, 0);

  const heap: HeapItem[] = [];
  heapPush(heap, { id: fromId, depth: 0, score: estimateRemainingHops(fromId, toId, maxLy) });

  while (heap.length) {
    const cur = heapPop(heap) as HeapItem;
    if (cur.depth >= maxDepth) continue;

    const neigh = await getNeighbors(cur.id, maxLy);

    for (const nid of neigh) {
      const nd = cur.depth + 1;

      const prev = bestDepth.get(nid);
      if (typeof prev === "number" && prev <= nd) continue;

      bestDepth.set(nid, nd);
      parents.set(nid, cur.id);

      if (nid === toId) {
        const path = rebuildPath(parents, toId);
        const res = { jumps: path.length - 1, path };
        cacheSet(key, res);
        return res;
      }

      const score = nd + estimateRemainingHops(nid, toId, maxLy);
      heapPush(heap, { id: nid, depth: nd, score });
    }
  }

  cacheSet(key, null);
  return null;
}
