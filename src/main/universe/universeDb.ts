import Database from "better-sqlite3";
import * as fs from "fs";
import { universeDbPath } from "./universePaths";

type SysRow = { solarSystemID: number; solarSystemName: string; x: number; y: number; z: number; security: number };

type Db = InstanceType<typeof Database>;

let db: Db | null = null;

function openDb(): Db {
  if (db) return db;
  const p = universeDbPath();
  db = new (Database as unknown as { new (path: string): Db })(p);
  db.pragma("journal_mode = WAL");
  return db;
}

export function createSchema(): void {
  const d = openDb();

  d.exec(`
    CREATE TABLE IF NOT EXISTS systems (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      name_lc TEXT NOT NULL,
      x REAL NOT NULL,
      y REAL NOT NULL,
      z REAL NOT NULL,
      security REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_systems_name_lc ON systems(name_lc);

    CREATE TABLE IF NOT EXISTS jumps (
      from_id INTEGER NOT NULL,
      to_id INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jumps_from ON jumps(from_id);
    CREATE INDEX IF NOT EXISTS idx_jumps_to ON jumps(to_id);

    CREATE TABLE IF NOT EXISTS meta (
      k TEXT PRIMARY KEY,
      v TEXT NOT NULL
    );
  `);
}

export function wipeData(): void {
  const d = openDb();
  d.exec(`DELETE FROM systems; DELETE FROM jumps; DELETE FROM meta;`);
}

export function setMeta(k: string, v: string): void {
  const d = openDb();
  const stmt = d.prepare(`INSERT INTO meta(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`);
  stmt.run(k, v);
}

export function getMeta(k: string): string | null {
  const d = openDb();
  const row = d.prepare(`SELECT v FROM meta WHERE k=?`).get(k) as { v: string } | undefined;
  return row ? row.v : null;
}

export function insertSystems(rows: SysRow[]): void {
  const d = openDb();
  const ins = d.prepare(`INSERT INTO systems(id, name, name_lc, x, y, z, security) VALUES(?, ?, ?, ?, ?, ?, ?)`);
  const tx = d.transaction((batchRows: SysRow[]) => {
    for (const r of batchRows) ins.run(r.solarSystemID, r.solarSystemName, r.solarSystemName.toLowerCase(), r.x, r.y, r.z, r.security);
  });
  tx(rows);
}

export function insertJumps(rows: Array<{ fromSolarSystemID: number; toSolarSystemID: number }>): void {
  const d = openDb();
  const ins = d.prepare(`INSERT INTO jumps(from_id, to_id) VALUES(?, ?)`);
  const tx = d.transaction((batchRows: Array<{ fromSolarSystemID: number; toSolarSystemID: number }>) => {
    for (const r of batchRows) ins.run(r.fromSolarSystemID, r.toSolarSystemID);
  });
  tx(rows);
}

export function resolveSystemByName(name: string): { id: number; name: string; x: number; y: number; z: number; security: number } | null {
  const d = openDb();
  const n = name.trim().toLowerCase();
  const row = d.prepare(`SELECT id, name, x, y, z, security FROM systems WHERE name_lc = ? LIMIT 1`).get(n) as any;
  if (!row) return null;
  return { id: row.id, name: row.name, x: row.x, y: row.y, z: row.z, security: row.security };
}

export function getSystemById(id: number): { id: number; name: string; x: number; y: number; z: number; security: number } | null {
  const d = openDb();
  const row = d.prepare(`SELECT id, name, x, y, z, security FROM systems WHERE id = ? LIMIT 1`).get(id) as any;
  if (!row) return null;
  return { id: row.id, name: row.name, x: row.x, y: row.y, z: row.z, security: row.security };
}

export function universeDbExists(): boolean {
  return fs.existsSync(universeDbPath());
}
