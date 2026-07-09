import type { ProtectionSettings } from "@/lib/engine/protections";
import type { CopilotSettings, Recommendation } from "@/lib/copilot/types";
/**
 * Unified data model.
 * Sources: 02_Investor_Operating_System.xlsx (Lists / Trade Journal / Risk Gate /
 * Weekly Portfolio / Monthly Review sheets), trading-and-portfolio-companion
 * ledger schemas, tickerbot watchlist rules ledger.
 */

export type GateState = "RISK ALLOWED" | "REDUCED RISK ONLY" | "NO NEW SWINGS";

export type Sleeve = "Core" | "Income" | "Satellite" | "Cash";
export type TradeStatus = "Open" | "Closed" | "Cancelled";
export type Direction = "Long" | "Short";
export type BlockStatus = "Not Started" | "Done" | "Exception";

export const SETUPS = [
  "Breakout",
  "Pullback",
  "Trend Continuation",
  "Mean Reversion",
  "Base Break",
  "Other",
] as const;
export type Setup = (typeof SETUPS)[number];

export const EXIT_REASONS = [
  "Target",
  "Stop",
  "Trail",
  "Time Stop",
  "Thesis Break",
  "Manual/Discretionary",
  "Event Risk",
] as const;
export type ExitReason = (typeof EXIT_REASONS)[number];

export const MISTAKE_TAGS = [
  "None",
  "Early Entry",
  "Late Entry",
  "Oversize",
  "Stop Moved",
  "No Stop",
  "Event Risk",
  "Chasing",
  "Overtrading",
  "Early Exit",
  "Late Exit",
  "Plan Violation",
  "Other",
] as const;
export type MistakeTag = (typeof MISTAKE_TAGS)[number];

export const THESIS_STATUSES = ["Intact", "Watch", "Broken"] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const GRADES = ["A", "B", "C", "D", "N/A"] as const;
export type Grade = (typeof GRADES)[number];

export const ACTIONS = ["Hold", "Add", "Trim", "Exit", "Rebalance", "Watch"] as const;
export type HoldingAction = (typeof ACTIONS)[number];

/** Behavioral-leak tags surfaced by journal_stats.py in the companion skill. */
export const NEGATIVE_TAGS = [
  "cut-winner-early",
  "let-loser-run",
  "moved-stop",
  "revenge-trade",
  "fomo-entry",
  "oversized",
  "overtrading",
  "broke-rules",
  "no-plan",
  "chased",
  "averaged-down",
] as const;

export interface GateThresholds {
  /** VIX caution ceiling. Workbook default 25. */
  vixMax: number;
  /** NFCI ceiling; positive = tighter-than-average conditions. Default +0.50. */
  nfciMax: number;
  /** Max tolerated drawdown from high-water mark, percent (positive number). Default 10. */
  maxDrawdownPct: number;
  /** Aggregate planned open swing risk budget, % of portfolio. Default 2. */
  openRiskBudgetPct: number;
}

export interface Settings {
  portfolioValue: number;
  benchmarkName: string; // e.g. "S&P 500"
  benchmarkSymbol: string; // e.g. "spy.us" (Stooq) / "SPY" (Alpha Vantage)
  thresholds: GateThresholds;
  /** Risk per trade as % of portfolio. Workbook example 0.5; companion range 0.5–2. */
  riskPerTradePct: number;
  /** Portfolio heat cap (Σ open planned risk), % of equity. Companion default ~6. */
  heatCapPct: number;
  /** Single-name notional cap, % of equity. Companion default 20–25. */
  notionalCapPct: number;
}

/** Manual/fetched inputs to the six-check gate. null = unknown (counts as a fail). */
export interface GateInputs {
  benchAbove200dma: boolean | null;
  benchClose?: number | null;
  benchSma200?: number | null;
  vix: number | null;
  nfci: number | null;
  /** Drawdown from high-water mark as a negative percent (0 = at highs). */
  drawdownPct: number | null;
  /** Any unaccepted binary-event risk present? */
  binaryEventRisk: boolean | null;
  asOf?: string;
  source?: string;
}

export interface GateCheck {
  id: string;
  label: string;
  current: string;
  threshold: string;
  pass: boolean;
  unknown: boolean;
  source: string;
}

export interface GateResult {
  state: GateState;
  checks: GateCheck[];
  fails: number;
  unknowns: number;
}

/** Superset of the workbook's 26 Trade Journal columns and the companion's 16-column ledger. */
export interface Trade {
  id: string;
  status: TradeStatus;
  gateAtEntry: GateState | "";
  strategy: Setup | "";
  ticker: string;
  direction: Direction;
  sleeve: Sleeve;
  entryDate: string;
  exitDate: string;
  entry: number | null;
  stop: number | null;
  target: number | null;
  shares: number | null;
  exitPrice: number | null;
  fees: number | null;
  mfePct: number | null;
  maePct: number | null;
  thesisGrade: Grade | "";
  /** Conviction 1–5 (companion `emotion`). */
  emotion: number | null;
  ruleFollowed: "Yes" | "No" | "";
  exitReason: ExitReason | "";
  mistakeTag: MistakeTag | "";
  thesis: string;
  lesson: string;
  nextRuleChange: "Yes" | "No" | "Review" | "";
  /** Semicolon-separated free tags (companion behavioral-leak vocabulary). */
  tags: string;
  /** Documented exception note when entered while gate ≠ RISK ALLOWED. */
  exceptionNote?: string;
}

/** Companion portfolio ledger + workbook Weekly Portfolio columns. */
export interface Holding {
  id: string;
  ticker: string;
  type: "Stock" | "ETF" | "Fund" | "Bond" | "Cash" | "Other";
  sleeve: Sleeve;
  shares: number | null;
  costBasis: number | null;
  price: number | null;
  /** Timestamp/date label of the last auto-fetched price (manual edits may clear meaning). */
  priceAsOf?: string | null;
  targetWeightPct: number | null;
  expenseRatioPct: number | null;
  yieldPct: number | null;
  payoutRatioPct: number | null;
  annualDistPerShare: number | null;
  benchmark: string;
  thesisStatus: ThesisStatus | "";
  payoutGrade: Grade | "";
  coverageNote: string;
  action: HoldingAction | "";
  notes: string;
}

export interface DailyBlock {
  id: string;
  status: BlockStatus;
  note: string;
}

export interface DailyCheck {
  date: string; // YYYY-MM-DD
  gateState: GateState;
  blocks: DailyBlock[];
  action: string;
  because: string;
  savedAt: string;
}

/** tickerbot rules ledger: ticker,metric,op,value,note */
export interface WatchRule {
  id: string;
  ticker: string;
  metric: string;
  op: ">" | "<" | ">=" | "<=";
  value: number;
  note: string;
}

export interface WatchDataRow {
  ticker: string;
  values: Record<string, number | null>;
}

export interface WatchData {
  rows: WatchDataRow[];
  asOf: string;
  source: string;
}

export interface RuleChange {
  oldRule: string;
  evidence: string;
  newRule: string;
  expectedBehavior: string;
  reviewDate: string;
}

export interface MonthlyRow {
  id: string;
  monthStart: string; // YYYY-MM-01
  startingValue: number | null;
  netContributions: number | null;
  endingValue: number | null;
  benchmarkReturnPct: number | null;
  notes: string;
  ruleChange: RuleChange | null;
}

export interface AppState {
  settings: Settings;
  gateInputs: GateInputs;
  dailyChecks: Record<string, DailyCheck>;
  trades: Trade[];
  holdings: Holding[];
  watchRules: WatchRule[];
  watchData: WatchData;
  monthly: MonthlyRow[];
  /** ISO-week stamps (e.g. "2026-W28") for completed weekly reviews. */
  weeklyReviews: string[];
  /** Copilot recommendations (proposed/approved/dismissed/expired/rejected). */
  recommendations: Recommendation[];
  protections: ProtectionSettings;
  copilot: CopilotSettings;
}

export const WATCH_METRICS = [
  "price",
  "pct_change",
  "volume_x_avg",
  "pct_from_52w_high",
  "rsi",
] as const;

export const DAILY_BLOCKS: { id: string; time: string; title: string; objective: string; rule: string }[] = [
  {
    id: "risk",
    time: "0:00–2:00",
    title: "Risk first",
    objective: "Update only changed Risk Gate inputs.",
    rule: "If the gate is closed, do not scan candidates.",
  },
  {
    id: "market",
    time: "2:00–5:00",
    title: "Market state",
    objective: "Benchmark vs 200-day MA; VIX; improving / stable / deteriorating.",
    rule: "Describe the state; do not invent a trade.",
  },
  {
    id: "events",
    time: "5:00–8:00",
    title: "Event risk",
    objective: "Macro calendar and events for holdings / open trades.",
    rule: "Mark only events that can alter existing risk.",
  },
  {
    id: "positions",
    time: "8:00–12:00",
    title: "Existing positions",
    objective: "Alerts, invalidations, stops, payouts, thesis changes.",
    rule: "Follow prewritten rules.",
  },
  {
    id: "candidates",
    time: "12:00–15:00",
    title: "Candidates",
    objective: "Existing approved watchlist only.",
    rule: "Only when the gate permits active risk.",
  },
];
