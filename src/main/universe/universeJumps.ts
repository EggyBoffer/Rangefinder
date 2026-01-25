import { universeDbPath } from "./universePaths";
import Database from "better-sqlite3";

type Db = InstanceType<typeof Database>;

let db: Db | null = null;

function openDb(): Db {
  if (db) return db;
  db = new (Database as unknown as { new (path: string): Db })(universeDbPath());
  return db;
}

export function getGateNeighbors(systemId: number): number[] {
  const d = openDb();
  const rows = d.prepare(`SELECT to_id as id FROM jumps WHERE from_id = ?`).all(systemId) as Array<{ id: number }>;
  return rows.map((r) => r.id);
}
