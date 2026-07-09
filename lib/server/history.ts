import { calendarDaysFor, mapToStooq, parseStooqDaily, type DailyRow } from "@/lib/engine/quotes";

/**
 * One place that knows how to pull daily history from Stooq, shared by the
 * Copilot scan, the backtester, and the bot — so every consumer sees the same
 * bars for the same symbol on the same day.
 */
export async function fetchDailyHistory(ticker: string, bars: number, revalidateSeconds = 1800): Promise<DailyRow[] | null> {
  const stooq = mapToStooq(ticker);
  const d2 = new Date();
  const d1 = new Date(d2.getTime() - calendarDaysFor(bars) * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  try {
    const res = await fetch(
      `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooq)}&i=d&d1=${fmt(d1)}&d2=${fmt(d2)}`,
      {
        next: { revalidate: revalidateSeconds },
        signal: AbortSignal.timeout(9000),
        headers: { "User-Agent": "axiom-investor-system/1.0" },
      },
    );
    if (!res.ok) return null;
    const rows = parseStooqDaily(await res.text());
    return rows.length ? rows : null;
  } catch {
    return null;
  }
}
