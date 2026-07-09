import { DEFAULT_PROTECTIONS } from "@/lib/engine/protections";
import { DEFAULT_COPILOT } from "@/lib/copilot/types";
import { defaultState } from "@/lib/store";
import type { AppState, Trade } from "@/lib/engine/types";

const BACKUP_VERSION = 1;

interface BackupEnvelope {
  app: "axiom-investor-system" | "investor-discipline-system"; // old marker still accepted on import
  version: number;
  exportedAt: string;
  state: AppState;
}

/** Serialize the whole app state into a portable, versioned backup file. */
export function exportBackup(state: AppState): string {
  const envelope: BackupEnvelope = {
    app: "axiom-investor-system",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state,
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * Parse a backup file back into an AppState, merged over defaults so older or
 * partial backups don't crash newer builds. Returns null if it isn't ours.
 */
export function importBackup(text: string): AppState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const env = parsed as Partial<BackupEnvelope>;
  const raw = ((env.app === "axiom-investor-system" || env.app === "investor-discipline-system") && env.state ? env.state : (parsed as AppState)) as Partial<AppState>;
  if (!raw || typeof raw !== "object") return null;
  return {
    ...defaultState,
    ...raw,
    settings: {
      ...defaultState.settings,
      ...raw.settings,
      thresholds: { ...defaultState.settings.thresholds, ...raw.settings?.thresholds },
    },
    gateInputs: { ...defaultState.gateInputs, ...raw.gateInputs },
    watchData: { ...defaultState.watchData, ...raw.watchData },
    dailyChecks: raw.dailyChecks ?? {},
    trades: Array.isArray(raw.trades) ? raw.trades : [],
    holdings: Array.isArray(raw.holdings) ? raw.holdings : [],
    watchRules: Array.isArray(raw.watchRules) ? raw.watchRules : [],
    monthly: Array.isArray(raw.monthly) ? raw.monthly : [],
    weeklyReviews: Array.isArray(raw.weeklyReviews) ? raw.weeklyReviews : [],
  };
}

const trade = (over: Partial<Trade>): Trade => ({
  id: over.id ?? "T0",
  status: "Closed",
  gateAtEntry: "RISK ALLOWED",
  strategy: "Pullback",
  ticker: "TICK",
  direction: "Long",
  sleeve: "Satellite",
  entryDate: "2026-06-02",
  exitDate: "2026-06-09",
  entry: 100,
  stop: 96,
  target: 112,
  shares: 125,
  exitPrice: 112,
  fees: 2,
  mfePct: 13,
  maePct: -2,
  thesisGrade: "B",
  emotion: 3,
  ruleFollowed: "Yes",
  exitReason: "Target",
  mistakeTag: "None",
  thesis: "Trend pullback to rising 20-day, prior base intact.",
  lesson: "Held to target; process matched plan.",
  nextRuleChange: "No",
  tags: "",
  ...over,
});

/**
 * A realistic populated state so an invited teammate can explore every surface
 * on first open instead of a wall of blanks. Deliberately mixed: wins, losses,
 * a rule-followed=No trade, and tagged leaks so the stats and flags light up.
 */
export function demoState(): AppState {
  return {
    settings: {
      portfolioValue: 100000,
      benchmarkName: "S&P 500",
      benchmarkSymbol: "spy.us",
      thresholds: { vixMax: 25, nfciMax: 0.5, maxDrawdownPct: 10, openRiskBudgetPct: 2 },
      riskPerTradePct: 0.5,
      heatCapPct: 6,
      notionalCapPct: 20,
    },
    gateInputs: {
      benchAbove200dma: true,
      benchClose: 552.4,
      benchSma200: 531.8,
      vix: 15.8,
      nfci: -0.5,
      drawdownPct: -1.5,
      binaryEventRisk: false,
      asOf: "2026-07-06 (sample)",
      source: "demo data",
    },
    dailyChecks: {},
    trades: [
      trade({ id: "TDEMO1", ticker: "MSFT", strategy: "Breakout", entry: 420, stop: 405, target: 460, shares: 33, exitPrice: 460, mfePct: 11, maePct: -1.5, thesisGrade: "A", lesson: "Clean breakout, sized from risk, exited at plan." }),
      trade({ id: "TDEMO2", ticker: "NKE", strategy: "Mean Reversion", entry: 78, stop: 74, target: 88, shares: 125, exitPrice: 74, fees: 3, mfePct: 2, maePct: -6, thesisGrade: "C", ruleFollowed: "Yes", exitReason: "Stop", mistakeTag: "Late Entry", lesson: "Chased an extended bounce; stop did its job.", tags: "fomo-entry" }),
      trade({ id: "TDEMO3", ticker: "AMD", strategy: "Trend Continuation", entry: 160, stop: 150, target: 185, shares: 25, exitPrice: 150, fees: 2, mfePct: 4, maePct: -6.3, thesisGrade: "B", ruleFollowed: "No", exitReason: "Manual/Discretionary", mistakeTag: "Stop Moved", lesson: "Widened the stop hoping for recovery — a process failure even though the loss was small.", tags: "moved-stop; averaged-down" }),
      trade({ id: "TDEMO4", ticker: "COST", strategy: "Pullback", entry: 880, stop: 850, target: 960, shares: 5, exitPrice: 934, fees: 1, mfePct: 9, maePct: -1.2, thesisGrade: "A", exitReason: "Trail", lesson: "Trailed a strong trend; left a little on the table, acceptable." }),
      trade({ id: "TDEMO5", status: "Open", ticker: "V", strategy: "Base Break", entry: 295, stop: 283, target: 330, shares: 16, exitPrice: null, fees: null, mfePct: null, maePct: null, exitReason: "", ruleFollowed: "", mistakeTag: "", exitDate: "", thesisGrade: "B", lesson: "", nextRuleChange: "", entryDate: "2026-07-01", thesis: "Break from a multi-week base on rising relative strength." }),
    ],
    holdings: [
      { id: "HDEMO1", ticker: "VTI", type: "ETF", sleeve: "Core", shares: 120, costBasis: 235, price: 291, targetWeightPct: 40, expenseRatioPct: 0.03, yieldPct: 1.3, payoutRatioPct: null, annualDistPerShare: 3.78, benchmark: "spy.us", thesisStatus: "Intact", payoutGrade: "A", coverageNote: "", action: "Hold", notes: "Core total-market anchor." },
      { id: "HDEMO2", ticker: "SCHD", type: "ETF", sleeve: "Income", shares: 300, costBasis: 74, price: 82, targetWeightPct: 25, expenseRatioPct: 0.06, yieldPct: 3.5, payoutRatioPct: null, annualDistPerShare: 2.87, benchmark: "spy.us", thesisStatus: "Intact", payoutGrade: "A", coverageNote: "Dividend growth intact.", action: "Hold", notes: "Dividend sleeve." },
      { id: "HDEMO3", ticker: "MSFT", type: "Stock", sleeve: "Satellite", shares: 40, costBasis: 300, price: 452, targetWeightPct: 15, expenseRatioPct: null, yieldPct: 0.7, payoutRatioPct: 25, annualDistPerShare: 3.32, benchmark: "spy.us", thesisStatus: "Intact", payoutGrade: "A", coverageNote: "", action: "Trim", notes: "Overweight vs target — trim on strength." },
      { id: "HDEMO4", ticker: "O", type: "Stock", sleeve: "Income", shares: 150, costBasis: 62, price: 58, targetWeightPct: 8, expenseRatioPct: null, yieldPct: 5.6, payoutRatioPct: 75, annualDistPerShare: 3.24, benchmark: "spy.us", thesisStatus: "Watch", payoutGrade: "B", coverageNote: "AFFO coverage adequate; watch rate sensitivity.", action: "Hold", notes: "Monthly payer." },
      { id: "HDEMO5", ticker: "Cash", type: "Cash", sleeve: "Cash", shares: 1, costBasis: 12000, price: 12000, targetWeightPct: 12, expenseRatioPct: null, yieldPct: 4.8, payoutRatioPct: null, annualDistPerShare: 576, benchmark: "", thesisStatus: "Intact", payoutGrade: "", coverageNote: "", action: "Hold", notes: "Dry powder / T-bill sweep." },
    ],
    watchRules: [
      { id: "WDEMO1", ticker: "AVGO", metric: "pct_from_52w_high", op: ">=", value: -5, note: "near highs — watch for base" },
      { id: "WDEMO2", ticker: "LLY", metric: "rsi", op: "<=", value: 40, note: "pullback zone" },
      { id: "WDEMO3", ticker: "NVDA", metric: "volume_x_avg", op: ">=", value: 1.5, note: "volume expansion" },
    ],
    watchData: {
      rows: [
        { ticker: "AVGO", values: { price: 1720, pct_change: 1.2, volume_x_avg: 1.1, pct_from_52w_high: -3, rsi: 61 } },
        { ticker: "LLY", values: { price: 905, pct_change: -0.8, volume_x_avg: 0.9, pct_from_52w_high: -12, rsi: 38 } },
        { ticker: "NVDA", values: { price: 141, pct_change: 2.4, volume_x_avg: 1.8, pct_from_52w_high: -2, rsi: 66 } },
      ],
      asOf: "2026-07-06 16:00 ET (sample)",
      source: "demo data",
    },
    monthly: [
      { id: "MDEMO1", monthStart: "2026-05-01", startingValue: 96000, netContributions: 1000, endingValue: 99800, benchmarkReturnPct: 2.6, notes: "Two clean swings; core sleeve carried most of the return.", ruleChange: null },
      { id: "MDEMO2", monthStart: "2026-06-01", startingValue: 99800, netContributions: 1000, endingValue: 101950, benchmarkReturnPct: 1.4, notes: "One stop-moving mistake on AMD flagged for review.", ruleChange: { oldRule: "Stops may be adjusted intraday on news.", evidence: "1 tagged moved-stop event; needs a larger sample before hard rule.", newRule: "No stop widening after entry — exits are stop or plan only.", expectedBehavior: "Zero moved-stop tags next month.", reviewDate: "2026-07-31" } },
    ],
    weeklyReviews: [],
    recommendations: [],
    protections: { ...DEFAULT_PROTECTIONS },
    copilot: { ...DEFAULT_COPILOT },
  };
}
