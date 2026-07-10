import { calendarDaysFor, mapToStooq, parseStooqDaily, type DailyRow } from "@/lib/engine/quotes";
import type { MarketAssetClass, MarketDataProvider } from "./types";

/**
 * The default provider: Stooq's free CSV endpoints. Keyless, delayed EOD,
 * and surprisingly broad — US equities/ETFs, spot metals, major crypto pairs,
 * and FX majors all answer. Server-side only (uses Next's fetch cache).
 */
export class StooqProvider implements MarketDataProvider {
  readonly id = "stooq";
  readonly label = "Stooq daily history (delayed EOD)";

  supports(assetClass: MarketAssetClass): boolean {
    // Bonds ride through as US-listed ETF proxies (TLT, AGG…); Commodity
    // beyond spot metals is the one class Stooq genuinely can't serve.
    return assetClass !== "Commodity";
  }

  async getDailyHistory(symbol: string, bars: number, revalidateSeconds = 1800): Promise<DailyRow[] | null> {
    const stooq = mapToStooq(symbol);
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
}
