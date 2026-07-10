import type { DailyRow } from "@/lib/engine/quotes";
import { getDailyHistory } from "@/lib/market-data";

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
