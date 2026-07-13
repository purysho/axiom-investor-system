import type { AppState, Trade } from "@/lib/engine/types";
import type { Recommendation } from "@/lib/copilot/types";
import { DEFAULT_COPILOT } from "@/lib/copilot/types";
import { DEFAULT_PROTECTIONS } from "@/lib/engine/protections";
import type { DailyRow } from "@/lib/engine/quotes";

/** Fixed "now" so every assertion is reproducible: 2026-01-10 12:00 UTC. */
export const NOW = Date.parse("2026-01-10T12:00:00Z");

export function baseState(overrides: Partial<AppState> = {}): AppState {
  return {
    settings: {
      portfolioValue: 100_000,
      benchmarkName: "S&P 500",
      benchmarkSymbol: "spy.us",
      thresholds: { vixMax: 25, nfciMax: 0.5, maxDrawdownPct: 10, openRiskBudgetPct: 2 },
      riskPerTradePct: 0.5,
      heatCapPct: 6,
      notionalCapPct: 20,
    },
    gateInputs: {
      benchAbove200dma: true,
      vix: 15,
      nfci: -0.5,
      drawdownPct: 0,
      binaryEventRisk: false,
    },
    dailyChecks: {},
    trades: [],
    holdings: [],
    watchRules: [],
    watchData: { rows: [], asOf: "", source: "" },
    monthly: [],
    weeklyReviews: [],
    recommendations: [],
    protections: { ...DEFAULT_PROTECTIONS },
    copilot: { ...DEFAULT_COPILOT },
    ...overrides,
  };
}

/** A valid trend-pullback-shaped proposal: 4% stop, 2R target, fresh data. */
export function baseRec(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "R-TEST",
    createdAt: new Date(NOW - 3_600_000).toISOString(),
    expiry: new Date(NOW + 2 * 86_400_000).toISOString(),
    status: "proposed",
    asset: "SPY",
    market: "Equity",
    timeframe: "Daily",
    side: "Long",
    strategy: "Trend pullback",
    entry: 100,
    stop: 96,
    takeProfits: [108],
    positionSize: null,
    maxRiskUsd: null,
    confidence: 0.55,
    evidence: ["Price above the 200-day average.", "Pullback to the 20-day with RSI 45."],
    invalidation: "A daily close below the stop voids the thesis.",
    dataAsOf: new Date(NOW - 86_400_000).toISOString().slice(0, 10),
    technical: { close: 100 },
    macro: { gateState: "" },
    sentiment: null,
    citations: ["test fixture"],
    source: "rules",
    validation: { ok: false, notes: [] },
    ...overrides,
  };
}

export function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: `T-${Math.random().toString(36).slice(2, 8)}`,
    status: "Closed",
    gateAtEntry: "RISK ALLOWED",
    strategy: "Pullback",
    ticker: "TEST",
    direction: "Long",
    sleeve: "Satellite",
    entryDate: "2026-01-02",
    exitDate: "2026-01-05",
    entry: 100,
    stop: 95,
    target: 110,
    shares: 10,
    exitPrice: 90,
    fees: 0,
    mfePct: null,
    maePct: null,
    thesisGrade: "",
    emotion: null,
    ruleFollowed: "Yes",
    exitReason: "Stop",
    mistakeTag: "None",
    thesis: "test",
    lesson: "learned something",
    nextRuleChange: "",
    tags: "",
    ...overrides,
  };
}

/** Deterministic PRNG (LCG) for reproducible synthetic price series. */
export function prng(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

/** Synthetic uptrend with periodic pullbacks — reliably produces entry signals.
 *  Dates advance over real weekdays only, so a series is never dated on a
 *  weekend (daily bars don't exist then). */
export function syntheticSeries(n: number, seed = 42, start = 100): DailyRow[] {
  const rand = prng(seed);
  const rows: DailyRow[] = [];
  let price = start;
  let cursor = new Date(Date.UTC(2020, 0, 1)); // a Wednesday
  const nextWeekday = (d: Date) => {
    let x = new Date(d.getTime() + 86_400_000);
    while (x.getUTCDay() === 0 || x.getUTCDay() === 6) x = new Date(x.getTime() + 86_400_000);
    return x;
  };
  for (let i = 0; i < n; i++) {
    const drift = 0.0006;
    const dip = i % 60 > 50 ? -0.004 : 0;
    const noise = (rand() - 0.5) * 0.02;
    const open = price;
    const close = price * (1 + drift + dip + noise);
    const high = Math.max(open, close) * (1 + rand() * 0.006);
    const low = Math.min(open, close) * (1 - rand() * 0.006);
    rows.push({ date: cursor.toISOString().slice(0, 10), open, high, low, close, volume: 1e6 });
    price = close;
    cursor = nextWeekday(cursor);
  }
  return rows;
}
