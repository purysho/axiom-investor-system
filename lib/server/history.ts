import type { DailyRow } from "@/lib/engine/quotes";
import { getDailyHistory, resolveHistory } from "@/lib/market-data";
import { AlpacaDataProvider } from "@/lib/market-data/alpaca";
import { StooqProvider } from "@/lib/market-data/stooq";
import { getAlpacaDataCreds } from "./broker-store";

/**
 * One place every server route gets daily history from, shared by the
 * Copilot scan, the backtester, the bot, and the benchmarks — so every
 * consumer sees the same bars for the same symbol on the same day.
 *
 * Since the market-data layer landed this is a thin delegate to the provider
 * registry (lib/market-data): the signature stays put so consumers don't
 * care which feed answered.
 */
export async function fetchDailyHistory(ticker: string, bars: number, revalidateSeconds = 1800): Promise<DailyRow[] | null> {
  return getDailyHistory(ticker, bars, revalidateSeconds);
}

/**
 * Same, but prefers a signed-in user's OWN connected Alpaca keys so charts,
 * quotes, the ticker, and backtests all show real IEX bars — falling back to
 * the shared registry (deployment key, else Stooq) when they haven't connected
 * or aren't signed in. Any Alpaca key (paper or live) can read market data.
 */
export async function fetchDailyHistoryForUser(
  userId: string | null,
  ticker: string,
  bars: number,
  revalidateSeconds = 1800,
): Promise<DailyRow[] | null> {
  if (userId) {
    const creds = await getAlpacaDataCreds(userId);
    if (creds) return resolveHistory([new AlpacaDataProvider(creds), new StooqProvider()], ticker, bars, revalidateSeconds);
  }
  return getDailyHistory(ticker, bars, revalidateSeconds);
}

/** True when this user will get real Alpaca bars (for source labelling). */
export async function usesRealData(userId: string | null): Promise<boolean> {
  return userId ? (await getAlpacaDataCreds(userId)) !== null : false;
}
