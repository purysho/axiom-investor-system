/** In-memory sliding-window limiter — right-sized for a single-instance deploy. */
const hits = new Map<string, number[]>();
let lastPrune = Date.now();

export function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (now - lastPrune > 60_000) {
    for (const [k, arr] of hits) {
      const kept = arr.filter((t) => now - t < 15 * 60_000);
      if (kept.length) hits.set(k, kept); else hits.delete(k);
    }
    lastPrune = now;
  }
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now);
  hits.set(key, arr);
  return false;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
}
