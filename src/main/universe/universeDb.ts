import Database from "better-sqlite3";
import * as fs from "fs";
import { universeDbPath } from "./universePaths";

type SysRow = {
  solarSystemID: number;
  solarSystemName: string;
  x: number;
  y: number;
  z: number;
  security: number;
};

type Db = InstanceType<typeof Database>;

let db: Db | null = null;

function openDb(): Db {
  if (db) return db;
  const p = universeDbPath();
  db = new (Database as unknown as { new (path: string): Db })(p);
  db.pragma("journal_mode = WAL");
  return db;
}

function columnExists(table: string, col: string): boolean {
  const d = openDb();
  const rows = d.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === col);
}

function ensureColumn(table: string, col: string, ddl: string): void {
  if (columnExists(table, col)) return;
  const d = openDb();
  d.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
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

  ensureColumn("systems", "sec_status", "sec_status REAL");
  ensureColumn("systems", "gx", "gx INTEGER");
  ensureColumn("systems", "gy", "gy INTEGER");
  ensureColumn("systems", "gz", "gz INTEGER");

  d.exec(`CREATE INDEX IF NOT EXISTS idx_systems_grid ON systems(gx, gy, gz)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_systems_sec_status ON systems(sec_status)`);
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
  const ins = d.prepare(
    `INSERT INTO systems(id, name, name_lc, x, y, z, security, sec_status, gx, gy, gz)
     VALUES(?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL)`
  );
  const tx = d.transaction((batchRows: SysRow[]) => {
    for (const r of batchRows) {
      ins.run(
        r.solarSystemID,
        r.solarSystemName,
        r.solarSystemName.toLowerCase(),
        r.x,
        r.y,
        r.z,
        r.security
      );
    }
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

export function resolveSystemByName(name: string): {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  security: number;
  secStatus: number | null;
} | null {
  const d = openDb();
  const n = name.trim().toLowerCase();
  const row = d
    .prepare(`SELECT id, name, x, y, z, security, sec_status as secStatus FROM systems WHERE name_lc = ? LIMIT 1`)
    .get(n) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    x: row.x,
    y: row.y,
    z: row.z,
    security: row.security,
    secStatus: row.secStatus === null ? null : Number(row.secStatus),
  };
}

export function suggestSystemsByName(
  query: string,
  limit: number
): Array<{ id: number; name: string; security: number; secStatus: number | null }> {
  const d = openDb();
  const q0 = String(query || "").trim().toLowerCase();
  if (!q0) return [];

  const lim = Number.isFinite(limit) ? Math.max(1, Math.min(25, Math.floor(limit))) : 10;
  const escaped = q0.replace(/[%_\\]/g, "\\$&");
  const like = `${escaped}%`;

  const rows = d
    .prepare(
      `SELECT id, name, security, sec_status as secStatus
       FROM systems
       WHERE name_lc LIKE ? ESCAPE '\\'
       ORDER BY (name_lc = ?) DESC, LENGTH(name) ASC, name ASC
       LIMIT ?`
    )
    .all(like, q0, lim) as any[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    security: row.security,
    secStatus: row.secStatus === null ? null : Number(row.secStatus),
  }));
}

export function getSystemById(id: number): {
  id: number;
  name: string;
  x: number;
  y: number;
  z: number;
  security: number;
  secStatus: number | null;
} | null {
  const d = openDb();
  const row = d
    .prepare(`SELECT id, name, x, y, z, security, sec_status as secStatus FROM systems WHERE id = ? LIMIT 1`)
    .get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    x: row.x,
    y: row.y,
    z: row.z,
    security: row.security,
    secStatus: row.secStatus === null ? null : Number(row.secStatus),
  };
}

export function universeDbExists(): boolean {
  return fs.existsSync(universeDbPath());
}

export function setSystemSecStatus(id: number, secStatus: number): void {
  const d = openDb();
  d.prepare(`UPDATE systems SET sec_status = ? WHERE id = ?`).run(secStatus, id);
}

export function getMissingSecStatusIds(limit: number): number[] {
  const d = openDb();
  const rows = d
    .prepare(`SELECT id FROM systems WHERE sec_status IS NULL ORDER BY id LIMIT ?`)
    .all(limit) as Array<{ id: number }>;
  return rows.map((r) => r.id);
}

export function countMissingSecStatus(): number {
  const d = openDb();
  const row = d.prepare(`SELECT COUNT(1) as c FROM systems WHERE sec_status IS NULL`).get() as any;
  return row ? Number(row.c) : 0;
}

function gridNeedsBuild(want: string): boolean {
  const v = getMeta("grid_bucket_m");
  if (v !== want) return true;
  if (!columnExists("systems", "gx") || !columnExists("systems", "gy") || !columnExists("systems", "gz")) return true;

  const d = openDb();
  const row = d.prepare(`SELECT COUNT(1) as c FROM systems WHERE gx IS NULL OR gy IS NULL OR gz IS NULL`).get() as any;
  return row ? Number(row.c) > 0 : true;
}

export function ensureGridIndex(bucketSizeMeters: number): void {
  const d = openDb();
  const want = String(Math.floor(bucketSizeMeters));

  if (!gridNeedsBuild(want)) return;

  d.prepare(
    `UPDATE systems
     SET gx = CAST(FLOOR(x / ?) AS INTEGER),
         gy = CAST(FLOOR(y / ?) AS INTEGER),
         gz = CAST(FLOOR(z / ?) AS INTEGER)`
  ).run(bucketSizeMeters, bucketSizeMeters, bucketSizeMeters);

  setMeta("grid_bucket_m", want);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_systems_grid ON systems(gx, gy, gz)`);
}

export function getSystemsInGridRange(
  gx0: number,
  gy0: number,
  gz0: number,
  r: number
): Array<{ id: number; name: string; x: number; y: number; z: number; security: number; secStatus: number | null }> {
  const d = openDb();
  const rows = d
    .prepare(
      `SELECT id, name, x, y, z, security, sec_status as secStatus
       FROM systems
       WHERE gx BETWEEN ? AND ?
         AND gy BETWEEN ? AND ?
         AND gz BETWEEN ? AND ?`
    )
    .all(gx0 - r, gx0 + r, gy0 - r, gy0 + r, gz0 - r, gz0 + r) as any[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    x: row.x,
    y: row.y,
    z: row.z,
    security: row.security,
    secStatus: row.secStatus === null ? null : Number(row.secStatus),
  }));
}

export function getGridCoordsForSystem(id: number): { gx: number; gy: number; gz: number } | null {
  const d = openDb();
  const row = d.prepare(`SELECT gx, gy, gz FROM systems WHERE id = ? LIMIT 1`).get(id) as any;
  if (!row || row.gx === null || row.gy === null || row.gz === null) return null;
  return { gx: row.gx, gy: row.gy, gz: row.gz };
}
