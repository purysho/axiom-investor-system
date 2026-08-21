import { calendarDaysFor, type DailyRow } from "@/lib/engine/quotes";
import type { MarketAssetClass, MarketDataProvider } from "./types";

/**
 * Real market data from Alpaca's Data API (the free IEX feed). Used ahead of
 * the delayed Stooq default whenever the deployment provides data credentials,
 * so charts, the Copilot, the bot, and backtests all run on real prices.
 *
 * Credentials are deployment-level (ALPACA_API_KEY_ID / ALPACA_API_SECRET_KEY,
 * or the APCA_* names Alpaca's own SDKs use). Any valid Alpaca key — paper or
 * live — can read market data; this never places orders and never sees a
 * user's per-account keys. When no credentials exist the provider is not
 * registered and the system falls back to Stooq unchanged.
 */

export interface AlpacaDataCreds { id: string; secret: string }

/** Deployment-level data credentials, or null when unset. */
export function alpacaDataCreds(): AlpacaDataCreds | null {
  const id = process.env.ALPACA_API_KEY_ID || process.env.APCA_API_KEY_ID;
  const secret = process.env.ALPACA_API_SECRET_KEY || process.env.APCA_API_SECRET_KEY;
  return id && secret ? { id, secret } : null;
}

export function hasAlpacaDataCreds(): boolean {
  return alpacaDataCreds() !== null;
}

interface AlpacaBar { t: string; o: number; h: number; l: number; c: number; v: number }

/** Pure: Alpaca bar objects → the platform's DailyRow shape. Exported for tests. */
export function mapAlpacaBars(bars: AlpacaBar[]): DailyRow[] {
  return bars
    .filter((b) => b && typeof b.c === "number")
    .map((b) => ({
      date: String(b.t).slice(0, 10),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v ?? 0,
    }));
}

export class AlpacaDataProvider implements MarketDataProvider {
  readonly id = "alpaca-data";
  readonly label = "Alpaca IEX daily bars (real, split/dividend-adjusted)";

  /** Explicit creds (e.g. a signed-in user's connected keys) override the
   *  deployment-level env keys. Null/omitted falls back to env. */
  constructor(private readonly overrideCreds?: AlpacaDataCreds | null) {}

  supports(assetClass: MarketAssetClass): boolean {
    // US equities, ETFs, and US-listed bond ETFs (TLT, AGG…) are all just
    // stock symbols to Alpaca. FX, spot metals, and crypto go elsewhere.
    return assetClass === "Equity" || assetClass === "ETF" || assetClass === "Bond";
  }

  async getDailyHistory(symbol: string, bars: number, revalidateSeconds = 1800): Promise<DailyRow[] | null> {
    const creds = this.overrideCreds ?? alpacaDataCreds();
    if (!creds) return null;

    const end = new Date();
    const start = new Date(end.getTime() - calendarDaysFor(bars) * 86400000);
    const params = new URLSearchParams({
      timeframe: "1Day",
      adjustment: "all",   // split + dividend adjusted — correct for backtests
      feed: "iex",         // the free feed
      limit: "10000",      // 10y of daily bars is ~2,520 — one page is plenty
      start: start.toISOString(),
      end: end.toISOString(),
      sort: "asc",
    });
    const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars?${params}`;

    try {
      const res = await fetch(url, {
        headers: { "APCA-API-KEY-ID": creds.id, "APCA-API-SECRET-KEY": creds.secret },
        next: { revalidate: revalidateSeconds },
        signal: AbortSignal.timeout(9000),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { bars?: AlpacaBar[] };
      const rows = mapAlpacaBars(j.bars ?? []);
      return rows.length ? rows : null;
    } catch {
      return null;
    }
  }
}
