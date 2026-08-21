import { NEGATIVE_TAGS, type Holding, type Trade } from "./types";

/** Planned risk in dollars for one trade: |entry − stop| × shares. */
export function plannedRiskUsd(t: Trade): number | null {
  if (t.entry === null || t.stop === null || t.shares === null) return null;
  return Math.abs(t.entry - t.stop) * t.shares;
}

export function grossPnl(t: Trade): number | null {
  if (t.entry === null || t.exitPrice === null || t.shares === null) return null;
  const sign = t.direction === "Short" ? -1 : 1;
  return (t.exitPrice - t.entry) * t.shares * sign;
}

export function netPnl(t: Trade): number | null {
  const g = grossPnl(t);
  if (g === null) return null;
  return g - (t.fees ?? 0);
}

export function rMultiple(t: Trade): number | null {
  const risk = plannedRiskUsd(t);
  const net = netPnl(t);
  if (risk === null || risk === 0 || net === null) return null;
  return net / risk;
}

export interface JournalStats {
  closedCount: number;
  openCount: number;
  netPnlUsd: number;
  winRatePct: number | null;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  largestLossR: number | null;
  maxDrawdownR: number | null;
  adherencePct: number | null;
  mistakeCounts: [string, number][];
  leakFlags: [string, number][];
  mfeMaeCompletePct: number | null;
}

/** Port of journal_stats.py: R-based expectancy, profit factor, adherence, leak tags, R-curve drawdown. */
export function journalStats(trades: Trade[]): JournalStats {
  const closed = trades.filter((t) => t.status === "Closed");
  const openCount = trades.filter((t) => t.status === "Open").length;

  const rs = closed
    .map((t) => rMultiple(t))
    .filter((r): r is number => r !== null && Number.isFinite(r));
  const wins = rs.filter((r) => r > 0);
  const losses = rs.filter((r) => r < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  // R-curve max drawdown (cumulative R, in ledger order)
  let peak = 0;
  let cum = 0;
  let maxDd = 0;
  for (const r of rs) {
    cum += r;
    peak = Math.max(peak, cum);
    maxDd = Math.max(maxDd, peak - cum);
  }

  const answered = closed.filter((t) => t.ruleFollowed === "Yes" || t.ruleFollowed === "No");
  const followed = answered.filter((t) => t.ruleFollowed === "Yes").length;

  const mistakeCounts = new Map<string, number>();
  for (const t of closed) {
    if (t.mistakeTag && t.mistakeTag !== "None") {
      mistakeCounts.set(t.mistakeTag, (mistakeCounts.get(t.mistakeTag) ?? 0) + 1);
    }
  }
  const leakCounts = new Map<string, number>();
  for (const t of closed) {
    for (const raw of t.tags.split(";")) {
      const tag = raw.trim().toLowerCase();
      if ((NEGATIVE_TAGS as readonly string[]).includes(tag)) {
        leakCounts.set(tag, (leakCounts.get(tag) ?? 0) + 1);
      }
    }
  }
  const withExcursions = closed.filter((t) => t.mfePct !== null && t.maePct !== null).length;

  const winRate = rs.length ? (wins.length / rs.length) * 100 : null;
  const avgWinR = wins.length ? grossWin / wins.length : null;
  const avgLossR = losses.length ? -grossLoss / losses.length : null;

  return {
    closedCount: closed.length,
    openCount,
    netPnlUsd: closed.reduce((a, t) => a + (netPnl(t) ?? 0), 0),
    winRatePct: winRate,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    avgWinR,
    avgLossR,
    expectancyR:
      winRate !== null && avgWinR !== null && avgLossR !== null
        ? (winRate / 100) * avgWinR + (1 - winRate / 100) * avgLossR
        : rs.length
          ? rs.reduce((a, b) => a + b, 0) / rs.length
          : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : wins.length ? null : null,
    largestLossR: losses.length ? Math.min(...losses) : null,
    maxDrawdownR: rs.length ? maxDd : null,
    adherencePct: answered.length ? (followed / answered.length) * 100 : null,
    mistakeCounts: [...mistakeCounts.entries()].sort((a, b) => b[1] - a[1]),
    leakFlags: [...leakCounts.entries()].sort((a, b) => b[1] - a[1]),
    mfeMaeCompletePct: closed.length ? (withExcursions / closed.length) * 100 : null,
  };
}

export interface SleeveBreakdown {
  sleeve: string;
  marketValue: number;
  weightPct: number;
  holdings: number;
}

export interface PortfolioStats {
  totalMarketValue: number;
  pricedCount: number;
  unpricedTickers: string[];
  forwardIncome: number;
  portfolioYieldPct: number | null;
  topWeightPct: number | null;
  topWeightTicker: string | null;
  top3IncomeConcPct: number | null;
  weightedExpensePct: number | null;
  /** Sum of unrealized P&L over holdings with cost basis; null if none have one. */
  totalUnrealizedUsd: number | null;
  /** Allocation by sleeve (Core/Income/Satellite/Cash), priced holdings only. */
  sleeves: SleeveBreakdown[];
  /** Herfindahl–Hirschman index over position weights (0–1; 1 = one position). */
  hhi: number | null;
  /** 1/HHI — "how many equally-sized positions is this really?" */
  effectiveHoldings: number | null;
  rows: {
    id: string;
    ticker: string;
    marketValue: number | null;
    weightPct: number | null;
    driftPct: number | null;
    incomeUsd: number | null;
    unrealizedUsd: number | null;
  }[];
}

/** Port of portfolio_calc.py: value, weights vs target/drift, concentration, fee drag, income. */
export function portfolioStats(holdings: Holding[]): PortfolioStats {
  const priced = holdings.filter((h) => h.price !== null && h.shares !== null);
  const totalMV = priced.reduce((a, h) => a + (h.price as number) * (h.shares as number), 0);

  const rows = holdings.map((h) => {
    const mv = h.price !== null && h.shares !== null ? h.price * h.shares : null;
    const weight = mv !== null && totalMV > 0 ? (mv / totalMV) * 100 : null;
    const income =
      h.annualDistPerShare !== null && h.shares !== null
        ? h.annualDistPerShare * h.shares
        : h.yieldPct !== null && mv !== null
          ? (mv * h.yieldPct) / 100
          : null;
    return {
      id: h.id,
      ticker: h.ticker,
      marketValue: mv,
      weightPct: weight,
      driftPct: weight !== null && h.targetWeightPct !== null ? weight - h.targetWeightPct : null,
      incomeUsd: income,
      unrealizedUsd:
        mv !== null && h.costBasis !== null && h.shares !== null
          ? mv - h.costBasis * h.shares
          : null,
    };
  });

  const incomes = rows
    .filter((r) => r.incomeUsd !== null)
    .map((r) => r.incomeUsd as number)
    .sort((a, b) => b - a);
  const forwardIncome = incomes.reduce((a, b) => a + b, 0);
  const top3Income = incomes.slice(0, 3).reduce((a, b) => a + b, 0);

  const weighted = holdings.filter(
    (h) => h.expenseRatioPct !== null && h.price !== null && h.shares !== null,
  );
  const weightedExpense =
    totalMV > 0 && weighted.length
      ? weighted.reduce(
          (a, h) => a + (h.expenseRatioPct as number) * ((h.price as number) * (h.shares as number)),
          0,
        ) / totalMV
      : null;

  const top = rows
    .filter((r) => r.weightPct !== null)
    .sort((a, b) => (b.weightPct as number) - (a.weightPct as number))[0];

  // Sleeve allocation over priced holdings.
  const bySleeve = new Map<string, { marketValue: number; holdings: number }>();
  for (const h of priced) {
    const mv = (h.price as number) * (h.shares as number);
    const cur = bySleeve.get(h.sleeve) ?? { marketValue: 0, holdings: 0 };
    bySleeve.set(h.sleeve, { marketValue: cur.marketValue + mv, holdings: cur.holdings + 1 });
  }
  const sleeves: SleeveBreakdown[] = [...bySleeve.entries()]
    .map(([sleeve, v]) => ({ sleeve, marketValue: v.marketValue, weightPct: totalMV > 0 ? (v.marketValue / totalMV) * 100 : 0, holdings: v.holdings }))
    .sort((a, b) => b.marketValue - a.marketValue);

  // Concentration: HHI over weights, and its reciprocal as "effective" count.
  const weights = rows.filter((r) => r.weightPct !== null).map((r) => (r.weightPct as number) / 100);
  const hhi = weights.length ? weights.reduce((a, w) => a + w * w, 0) : null;
  const effectiveHoldings = hhi && hhi > 0 ? 1 / hhi : null;

  const unrealized = rows.filter((r) => r.unrealizedUsd !== null).map((r) => r.unrealizedUsd as number);

  return {
    totalMarketValue: totalMV,
    pricedCount: priced.length,
    unpricedTickers: holdings
      .filter((h) => h.price === null || h.shares === null)
      .map((h) => h.ticker),
    forwardIncome,
    portfolioYieldPct: totalMV > 0 ? (forwardIncome / totalMV) * 100 : null,
    topWeightPct: top?.weightPct ?? null,
    topWeightTicker: top?.ticker ?? null,
    top3IncomeConcPct: forwardIncome > 0 ? (top3Income / forwardIncome) * 100 : null,
    weightedExpensePct: weightedExpense,
    totalUnrealizedUsd: unrealized.length ? unrealized.reduce((a, b) => a + b, 0) : null,
    sleeves,
    hhi,
    effectiveHoldings,
    rows,
  };
}

/** Workbook Monthly Review: flow-adjusted approximation, not full time-weighted return. */
export function flowAdjustedReturnPct(
  start: number | null,
  contributions: number | null,
  end: number | null,
): number | null {
  if (start === null || end === null) return null;
  const c = contributions ?? 0;
  const denom = start + c / 2;
  if (denom === 0) return null;
  return ((end - start - c) / denom) * 100;
}
