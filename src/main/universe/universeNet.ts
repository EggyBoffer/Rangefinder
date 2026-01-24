import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { pipeline } from "stream/promises";

export async function downloadToFile(url: string, outPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(outPath), { recursive: true });

  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status} ${res.statusText}`);

  const file = fs.createWriteStream(outPath);
  await pipeline(res.body as any, file);
}
