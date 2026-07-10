import { StooqProvider } from "./stooq";
import { classifySymbol, type MarketAssetClass, type MarketDataProvider } from "./types";

export { classifySymbol };
export type { MarketAssetClass, MarketDataProvider };

/**
 * Provider registry. Order matters: the first provider that supports the
 * asset class wins. Today that's always Stooq; keyed providers slot in
 * ahead of it when their credentials exist.
 *
 * TODO(keys): AlpacaDataProvider — real-time/minute bars for Equity+ETF+Crypto
 *   using the user's existing broker keys (wire through lib/server/broker-store).
 * TODO(keys): AlphaVantageProvider — ALPHA_VANTAGE_API_KEY already exists in
 *   .env.local.example (25 req/day free tier); useful for FX and commodities.
 */
const REGISTRY: MarketDataProvider[] = [new StooqProvider()];

/** The provider that will serve `symbol`, or null when no feed can. */
export function providerFor(symbol: string): MarketDataProvider | null {
  const assetClass = classifySymbol(symbol);
  return REGISTRY.find((p) => p.supports(assetClass)) ?? null;
}

/** Convenience used by every server route: bars for a symbol via the registry. */
export async function getDailyHistory(symbol: string, bars: number, revalidateSeconds?: number) {
  const p = providerFor(symbol);
  if (!p) return null;
  return p.getDailyHistory(symbol, bars, revalidateSeconds);
}

/** Registered providers, for status/docs surfaces. */
export function listProviders(): Array<{ id: string; label: string }> {
  return REGISTRY.map((p) => ({ id: p.id, label: p.label }));
}
