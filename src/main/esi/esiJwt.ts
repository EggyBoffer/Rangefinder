function b64urlToBuf(str: string): Buffer {
  const s = String(str || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4;
  const padded = pad ? s + "=".repeat(4 - pad) : s;
  return Buffer.from(padded, "base64");
}

export function decodeJwtPayload(jwt: string): Record<string, any> | null {
  try {
    const parts = String(jwt || "").split(".");
    if (parts.length < 2) return null;
    const buf = b64urlToBuf(parts[1]);
    const json = JSON.parse(buf.toString("utf-8"));
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

export function extractCharacterFromJwt(jwt: string): { characterId: number; characterName: string } | null {
  const payload = decodeJwtPayload(jwt);
  if (!payload) return null;

  const sub = String(payload.sub || "");
  const name = String(payload.name || payload.character_name || "");
  const m = sub.match(/CHARACTER:EVE:(\d+)/);

  const characterId = m ? Number(m[1]) : 0;
  return characterId > 0 ? { characterId, characterName: name.trim() } : null;
}
