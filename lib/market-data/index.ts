import { AlpacaDataProvider, hasAlpacaDataCreds } from "./alpaca";
import { StooqProvider } from "./stooq";
import { classifySymbol, type MarketAssetClass, type MarketDataProvider } from "./types";

export { classifySymbol };
export type { MarketAssetClass, MarketDataProvider };

/**
 * Provider registry. Order matters: the first provider that both supports the
 * asset class AND returns data wins, so a keyed real-data feed sits ahead of
 * the free delayed default and Stooq catches whatever it can't serve.
 *
 * Alpaca's real IEX feed is registered only when the deployment supplies data
 * credentials (see lib/market-data/alpaca.ts); otherwise the system runs on
 * Stooq exactly as before — no behaviour change for keyless deployments.
 *
 * TODO(keys): AlphaVantageProvider — ALPHA_VANTAGE_API_KEY, useful for FX and
 *   commodities that neither Alpaca stocks nor Stooq cover.
 */
const REGISTRY: MarketDataProvider[] = [
  ...(hasAlpacaDataCreds() ? [new AlpacaDataProvider()] : []),
  new StooqProvider(),
];

/** The provider that will be TRIED FIRST for `symbol`, or null when none can. */
export function providerFor(symbol: string): MarketDataProvider | null {
  const assetClass = classifySymbol(symbol);
  return REGISTRY.find((p) => p.supports(assetClass)) ?? null;
}

/**
 * Try each supporting provider in order until one returns data. Pure over the
 * provider list so the fallback behaviour is unit-testable without network or
 * env. A provider returning null (no data / unreachable) falls through to the
 * next; only when all are exhausted do we return null ("unknown", never flat).
 */
export async function resolveHistory(
  providers: MarketDataProvider[],
  symbol: string,
  bars: number,
  revalidateSeconds?: number,
) {
  const assetClass = classifySymbol(symbol);
  for (const p of providers) {
    if (!p.supports(assetClass)) continue;
    const rows = await p.getDailyHistory(symbol, bars, revalidateSeconds);
    if (rows && rows.length) return rows;
  }
  return null;
}

/** Convenience used by every server route: bars for a symbol via the registry. */
export function getDailyHistory(symbol: string, bars: number, revalidateSeconds?: number) {
  return resolveHistory(REGISTRY, symbol, bars, revalidateSeconds);
}

/** Registered providers, for status/docs surfaces. */
export function listProviders(): Array<{ id: string; label: string }> {
  return REGISTRY.map((p) => ({ id: p.id, label: p.label }));
}
