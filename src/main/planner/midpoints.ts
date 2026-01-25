import { getGateNeighbors } from "../universe/universeJumps";
import { getSystemById } from "../universe/universeDb";
import { calcLightyears } from "../universe/universeMath";

type Node = { id: number; parent: number | null; depth: number };

export function estimateMidpointsByCorridor(
  fromId: number,
  toId: number,
  maxLy: number,
  gateRadius: number,
  maxJumpDepth: number
): { ok: true; jumpsNeeded: number; midpointsNeeded: number } | { ok: false; error: string } {
  const from = getSystemById(fromId);
  const to = getSystemById(toId);
  if (!from || !to) return { ok: false, error: "Missing systems" };

  const direct = calcLightyears(from.x, from.y, from.z, to.x, to.y, to.z);
  if (direct <= maxLy) return { ok: true, jumpsNeeded: 1, midpointsNeeded: 0 };

  const corridor = collectCorridorSystems(fromId, gateRadius);
  corridor.add(fromId);
  corridor.add(toId);

  const jumpNeighbors = (id: number): number[] => {
    const a = getSystemById(id);
    if (!a) return [];
    const out: number[] = [];
    for (const cand of corridor) {
      if (cand === id) continue;
      const b = getSystemById(cand);
      if (!b) continue;
      const dly = calcLightyears(a.x, a.y, a.z, b.x, b.y, b.z);
      if (dly <= maxLy) out.push(cand);
    }
    return out;
  };

  const res = bfsMinJumps(fromId, toId, jumpNeighbors, maxJumpDepth);
  if (!res.ok) return res;

  const jumpsNeeded = res.jumps;
  const midpointsNeeded = Math.max(0, jumpsNeeded - 1);
  return { ok: true, jumpsNeeded, midpointsNeeded };
}

function collectCorridorSystems(startId: number, gateRadius: number): Set<number> {
  const seen = new Set<number>();
  const q: Array<{ id: number; depth: number }> = [{ id: startId, depth: 0 }];
  seen.add(startId);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.depth >= gateRadius) continue;

    for (const n of getGateNeighbors(cur.id)) {
      if (seen.has(n)) continue;
      seen.add(n);
      q.push({ id: n, depth: cur.depth + 1 });
    }
  }

  return seen;
}

function bfsMinJumps(
  startId: number,
  targetId: number,
  neighbors: (id: number) => number[],
  maxDepth: number
): { ok: true; jumps: number } | { ok: false; error: string } {
  const q: Node[] = [{ id: startId, parent: null, depth: 0 }];
  const seen = new Set<number>([startId]);

  while (q.length) {
    const cur = q.shift()!;
    if (cur.depth > maxDepth) continue;

    for (const n of neighbors(cur.id)) {
      if (seen.has(n)) continue;
      if (n === targetId) return { ok: true, jumps: cur.depth + 1 };
      seen.add(n);
      q.push({ id: n, parent: cur.id, depth: cur.depth + 1 });
    }
  }

  return { ok: false, error: "No route found in search limits" };
}
