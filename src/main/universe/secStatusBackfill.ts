import { countMissingSecStatus, getMissingSecStatusIds, setSystemSecStatus } from "./universeDb";
import { fetchSystemSecurityStatus } from "./esiPublic";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function startSecStatusBackfill(): Promise<void> {
  let remaining = countMissingSecStatus();
  if (remaining <= 0) return;

  for (;;) {
    const ids = getMissingSecStatusIds(25);
    if (!ids.length) return;

    for (const id of ids) {
      const sec = await fetchSystemSecurityStatus(id);
      if (sec !== null) setSystemSecStatus(id, sec);
      await sleep(140);
    }

    remaining = countMissingSecStatus();
    if (remaining <= 0) return;

    await sleep(500);
  }
}
