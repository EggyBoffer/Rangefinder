import * as fs from "fs";
import * as fsp from "fs/promises";
import * as readline from "readline";
import { SOLAR_JUMPS_CSV, SOLAR_SYSTEMS_CSV } from "./universeConstants";
import { universeDirPath, universeTmpPath } from "./universePaths";
import { downloadToFile } from "./universeNet";
import { parseCsvLine } from "./universeCsv";
import { createSchema, wipeData, insertSystems, insertJumps, setMeta, getMeta, universeDbExists } from "./universeDb";

async function importSystems(csvPath: string): Promise<void> {
  const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  const batch: any[] = [];

  for await (const line of rl) {
    if (!line) continue;
    const cols = parseCsvLine(line);

    if (!header) {
      header = cols;
      continue;
    }

    const idx = (name: string) => header!.indexOf(name);

    const solarSystemID = Number(cols[idx("solarSystemID")]);
    const solarSystemName = String(cols[idx("solarSystemName")]);
    const x = Number(cols[idx("x")]);
    const y = Number(cols[idx("y")]);
    const z = Number(cols[idx("z")]);
    const security = Number(cols[idx("security")]);

    if (!Number.isFinite(solarSystemID) || !solarSystemName) continue;

    batch.push({ solarSystemID, solarSystemName, x, y, z, security });

    if (batch.length >= 2000) {
      insertSystems(batch.splice(0, batch.length));
    }
  }

  if (batch.length) insertSystems(batch);
}

async function importJumps(csvPath: string): Promise<void> {
  const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let header: string[] | null = null;
  const batch: any[] = [];

  for await (const line of rl) {
    if (!line) continue;
    const cols = parseCsvLine(line);

    if (!header) {
      header = cols;
      continue;
    }

    const idx = (name: string) => header!.indexOf(name);

    const fromSolarSystemID = Number(cols[idx("fromSolarSystemID")]);
    const toSolarSystemID = Number(cols[idx("toSolarSystemID")]);

    if (!Number.isFinite(fromSolarSystemID) || !Number.isFinite(toSolarSystemID)) continue;

    batch.push({ fromSolarSystemID, toSolarSystemID });

    if (batch.length >= 5000) {
      insertJumps(batch.splice(0, batch.length));
    }
  }

  if (batch.length) insertJumps(batch);
}

export async function ensureUniverseReady(): Promise<void> {
  await fsp.mkdir(universeDirPath(), { recursive: true });

  createSchema();

  const imported = getMeta("imported_ok");
  if (universeDbExists() && imported === "1") return;

  const sysCsv = universeTmpPath("mapSolarSystems.csv");
  const jmpCsv = universeTmpPath("mapSolarSystemJumps.csv");

  await downloadToFile(SOLAR_SYSTEMS_CSV, sysCsv);
  await downloadToFile(SOLAR_JUMPS_CSV, jmpCsv);

  wipeData();

  await importSystems(sysCsv);
  await importJumps(jmpCsv);

  setMeta("imported_ok", "1");
  setMeta("source", "fuzzwork");
  setMeta("systems_csv", SOLAR_SYSTEMS_CSV);
  setMeta("jumps_csv", SOLAR_JUMPS_CSV);
}
