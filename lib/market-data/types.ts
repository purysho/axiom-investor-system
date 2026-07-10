import type { DailyRow } from "@/lib/engine/quotes";

/**
 * Market-data abstraction. Everything above this layer asks for bars by
 * symbol + asset class and neither knows nor cares which feed answered —
 * so a keyed provider (Alpaca data API, Alpha Vantage, a crypto exchange)
 * can slot in beside the free default without touching the strategy
 * engine, the backtester, the Copilot, or the bot.
 */

/** Unified asset-class vocabulary across the platform. */
export type MarketAssetClass =
  | "Equity" | "ETF" | "Crypto" | "FX" | "Metal" | "Commodity" | "Bond" | "Other";

export interface MarketDataProvider {
  readonly id: string;
  /** Human-readable label with the data caveat, e.g. "Stooq (delayed EOD)". */
  readonly label: string;
  /** Which asset classes this provider can serve. */
  supports(assetClass: MarketAssetClass): boolean;
  /**
   * Daily OHLCV history: at least `bars` trading days ending at the most
   * recent available session. Null when the feed has nothing for the symbol —
   * callers must treat that as "unknown", never as "flat".
   */
  getDailyHistory(symbol: string, bars: number, revalidateSeconds?: number): Promise<DailyRow[] | null>;
}

/** Symbols Stooq (and our conventions) treat as spot metals. */
const METALS = new Set(["XAUUSD", "XAGUSD", "XPTUSD", "XPDUSD"]);
/** Large-cap crypto pairs in our symbol conventions. */
const CRYPTO = new Set(["BTCUSD", "ETHUSD", "SOLUSD", "ADAUSD", "XRPUSD", "LTCUSD", "DOGEUSD", "BNBUSD", "DOTUSD"]);
/** FX majors. */
const FX = new Set(["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]);
/** Bond ETFs we recognize as bond exposure (proxy tickers, US-listed). */
const BOND_ETFS = new Set(["TLT", "IEF", "SHY", "BND", "AGG", "LQD", "HYG", "TIP"]);
/** Broad-market ETFs recognized as ETF rather than single-name equity. */
const KNOWN_ETFS = new Set(["SPY", "VOO", "VTI", "QQQ", "IWM", "DIA", "EFA", "EEM", "SCHD", "VIG", "GLD", "SLV"]);

/**
 * Best-effort classification from the symbol alone. Deterministic and
 * conservative: anything unrecognized that looks like a US ticker is Equity,
 * and explicit exchange-suffixed symbols (vusa.uk) are Other until a provider
 * claims them.
 */
export function classifySymbol(symbol: string): MarketAssetClass {
  const s = symbol.trim().toUpperCase();
  if (!s) return "Other";
  if (METALS.has(s)) return "Metal";
  if (CRYPTO.has(s)) return "Crypto";
  if (FX.has(s)) return "FX";
  if (BOND_ETFS.has(s)) return "Bond";
  if (KNOWN_ETFS.has(s)) return "ETF";
  if (s.includes(".") || s.startsWith("^")) return "Other";
  if (/^[A-Z]{1,5}$/.test(s)) return "Equity";
  return "Other";
}
