export function isDevMode(): boolean {
  return process.env.RANGEFINDER_DEV === "1";
}
