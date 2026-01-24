export function calcLightyears(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;
  const meters = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return meters / 9.4607304725808e15;
}
