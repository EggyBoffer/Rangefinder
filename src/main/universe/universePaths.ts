import { app } from "electron";
import * as path from "path";
import { UNIVERSE_DB_NAME, UNIVERSE_DIR } from "./universeConstants";

export function universeDirPath(): string {
  return path.join(app.getPath("userData"), UNIVERSE_DIR);
}

export function universeDbPath(): string {
  return path.join(universeDirPath(), UNIVERSE_DB_NAME);
}

export function universeTmpPath(filename: string): string {
  return path.join(universeDirPath(), filename);
}
