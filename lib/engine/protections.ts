import type { AppState, Trade } from "@/lib/engine/types";
import { rMultiple } from "@/lib/engine/stats";

/**
 * Behavioural protections.
 *
 * Axiom's risk gate reads the *market*. These read *you* — your recent trading —
 * and can lock out new entries entirely or for one symbol. The idea is borrowed
 * (as a pattern, not as code) from Freqtrade's protection plugins: StoplossGuard,
 * MaxDrawdown, CooldownPeriod and LowProfitPairs. Freqtrade is GPL-3; nothing here
 * is copied from it.
 *
 * Two are specific to Axiom's methodology: a revenge-trade guard, and a rule that
 * you cannot open new risk while closed trades are still missing their reflection.
 * The journal already *names* these leaks. Protections make them binding.
 */

export type LockScope = "global" | "symbol";

export interface Lock {
  id: string;
  scope: LockScope;
  symbol?: string;
  /** ISO timestamp; the lock stands until this moment. */
  until: string;
  reason: string;
  /** What the user can do about it. Empty when it is simply time. */
  remedy?: string;
}

export interface ProtectionSettings {
  enabled: boolean;
  /** Pause after any losing trade closes. */
  cooldownMinutes: number;
  /** N stop-outs inside the lookback → lock everything. */
  stoplossGuard: { trades: number; lookbackDays: number; lockHours: number };
  /** Realised drawdown over the lookback, as % of portfolio → lock everything. */
  maxDrawdown: { pct: number; lookbackDays: number; lockHours: number };
  /** A single symbol losing repeatedly → lock that symbol only. */
  symbolLoss: { losses: number; lookbackDays: number; lockDays: number };
  /** Block new entries while closed trades lack a reflection. */
  requireReflections: boolean;
  /** Minutes after a loss during which a new entry counts as revenge. */
  revengeWindowMinutes: number;
  /** Realised losses TODAY as % of portfolio → done for the day. Optional for
   *  states saved before this rule existed; the default applies when absent. */
  dailyLoss?: { pct: number };
}

export const DEFAULT_PROTECTIONS: ProtectionSettings = {
  enabled: true,
  cooldownMinutes: 60,
  stoplossGuard: { trades: 3, lookbackDays: 5, lockHours: 24 },
  maxDrawdown: { pct: 4, lookbackDays: 14, lockHours: 48 },
  symbolLoss: { losses: 2, lookbackDays: 30, lockDays: 14 },
  requireReflections: true,
  revengeWindowMinutes: 30,
  dailyLoss: { pct: 2 },
};

const MS_DAY = 86_400_000;
const MS_MIN = 60_000;

/**
 * When does a triggered lock end?
 *
 * Two conditions must BOTH clear. (a) The cooldown after the most recent
 * offending trade must elapse. (b) The triggering condition itself must stop
 * holding — which happens as the offending trades age out of the lookback
 * window. Releasing on (a) alone would unlock you while the drawdown that
 * caused the lock is still real and still inside its window.
 */
function lockUntil(offending: number[], lockMs: number, lookbackMs: number): number {
  const newest = Math.max(...offending);
  const oldest = Math.min(...offending);
  return Math.max(newest + lockMs, oldest + lookbackMs);
}

/** Closed trades are dated by exitDate (YYYY-MM-DD); treat as end of that day. */
function closedAt(t: Trade): number {
  if (!t.exitDate) return 0;
  return new Date(`${t.exitDate}T23:59:59Z`).getTime();
}

function realisedUsd(t: Trade): number {
  if (t.entry == null || t.exitPrice == null || t.shares == null) return 0;
  const gross = (t.exitPrice - t.entry) * t.shares * (t.direction === "Short" ? -1 : 1);
  return gross - (t.fees ?? 0);
}

function isLoss(t: Trade): boolean {
  const r = rMultiple(t);
  return r != null ? r < 0 : realisedUsd(t) < 0;
}

/** A trade that ended because the stop was hit. */
function stoppedOut(t: Trade): boolean {
  return t.exitReason === "Stop" || (t.exitReason === "" && isLoss(t));
}

function needsReflection(t: Trade): boolean {
  return t.status === "Closed" && (!t.lesson?.trim() || !t.ruleFollowed);
}

/**
 * Evaluate every protection against the user's own history.
 * Pure: no clock reads beyond `now`, no I/O — so it is testable and can run
 * identically on the client (for display) and the server (for enforcement).
 */
export function evaluateProtections(state: AppState, now = Date.now()): Lock[] {
  const p = state.protections ?? DEFAULT_PROTECTIONS;
  if (!p.enabled) return [];

  const locks: Lock[] = [];
  const closed = state.trades.filter((t) => t.status === "Closed" && t.exitDate);

  // ── 1. Reflections outstanding ──────────────────────────────────────────
  if (p.requireReflections) {
    const unreflected = state.trades.filter(needsReflection);
    if (unreflected.length > 0) {
      locks.push({
        id: "reflections",
        scope: "global",
        until: new Date(now + 365 * MS_DAY).toISOString(), // until the work is done
        reason: `${unreflected.length} closed trade${unreflected.length === 1 ? "" : "s"} still ${unreflected.length === 1 ? "needs" : "need"} a reflection.`,
        remedy: "Finish the reflection in the journal. Evidence before the next bet.",
      });
    }
  }

  // ── 2. Cooldown after a loss ────────────────────────────────────────────
  if (p.cooldownMinutes > 0) {
    const lastLoss = closed.filter(isLoss).sort((a, b) => closedAt(b) - closedAt(a))[0];
    if (lastLoss) {
      const until = closedAt(lastLoss) + p.cooldownMinutes * MS_MIN;
      if (until > now) {
        locks.push({
          id: "cooldown",
          scope: "global",
          until: new Date(until).toISOString(),
          reason: `Cooling off after the loss on ${lastLoss.ticker}.`,
        });
      }
    }
  }

  // ── 3. Revenge-trade guard (tighter window, explicit naming) ────────────
  if (p.revengeWindowMinutes > 0) {
    const recentLoss = closed
      .filter(isLoss)
      .find((t) => now - closedAt(t) < p.revengeWindowMinutes * MS_MIN && now >= closedAt(t));
    if (recentLoss) {
      locks.push({
        id: "revenge",
        scope: "global",
        until: new Date(closedAt(recentLoss) + p.revengeWindowMinutes * MS_MIN).toISOString(),
        reason: `You closed ${recentLoss.ticker} at a loss minutes ago. Entering now is the definition of a revenge trade.`,
        remedy: "Walk away. The setup will still be there tomorrow, or it was never a setup.",
      });
    }
  }

  // ── 4. Stoploss guard: N stop-outs in a short window ────────────────────
  {
    const { trades, lookbackDays, lockHours } = p.stoplossGuard;
    const since = now - lookbackDays * MS_DAY;
    const recent = closed.filter((t) => closedAt(t) >= since && stoppedOut(t));
    if (recent.length >= trades) {
      const until = lockUntil(recent.map(closedAt), lockHours * 3_600_000, lookbackDays * MS_DAY);
      if (until > now) {
        locks.push({
          id: "stoploss-guard",
          scope: "global",
          until: new Date(until).toISOString(),
          reason: `${recent.length} stop-outs in ${lookbackDays} days. Either the market changed or your edge did.`,
          remedy: "Review the last few trades before risking more.",
        });
      }
    }
  }

  // ── 4b. Daily loss limit: down X% today → done for the day ──────────────
  {
    const dailyPct = (p.dailyLoss ?? DEFAULT_PROTECTIONS.dailyLoss)?.pct ?? 0;
    if (dailyPct > 0 && state.settings.portfolioValue > 0) {
      const today = new Date(now).toISOString().slice(0, 10);
      const todayNet = closed
        .filter((t) => t.exitDate === today)
        .reduce((sum, t) => sum + realisedUsd(t), 0);
      if (todayNet <= -(dailyPct / 100) * state.settings.portfolioValue) {
        const nextMidnight = new Date(now);
        nextMidnight.setUTCHours(24, 0, 0, 0);
        locks.push({
          id: "daily-loss",
          scope: "global",
          until: nextMidnight.toISOString(),
          reason: `Down ${Math.abs((todayNet / state.settings.portfolioValue) * 100).toFixed(1)}% today (limit ${dailyPct}%). You are done for the day.`,
          remedy: "Tomorrow exists. Nothing you do in the next few hours will be your best decision.",
        });
      }
    }
  }

  // ── 5. Max realised drawdown over a window ──────────────────────────────
  {
    const { pct, lookbackDays, lockHours } = p.maxDrawdown;
    const since = now - lookbackDays * MS_DAY;
    const window = closed.filter((t) => closedAt(t) >= since);
    const net = window.reduce((sum, t) => sum + realisedUsd(t), 0);
    const limit = -(pct / 100) * state.settings.portfolioValue;
    if (window.length > 0 && net <= limit) {
      const losers = window.filter(isLoss).map(closedAt);
      const until = lockUntil(losers.length ? losers : window.map(closedAt), lockHours * 3_600_000, lookbackDays * MS_DAY);
      if (until > now) {
        locks.push({
          id: "max-drawdown",
          scope: "global",
          until: new Date(until).toISOString(),
          reason: `Realised ${Math.abs(net / state.settings.portfolioValue * 100).toFixed(1)}% drawdown in ${lookbackDays} days (limit ${pct}%).`,
          remedy: "Size down or stand aside until the monthly review.",
        });
      }
    }
  }

  // ── 6. Per-symbol loss guard ────────────────────────────────────────────
  {
    const { losses, lookbackDays, lockDays } = p.symbolLoss;
    const since = now - lookbackDays * MS_DAY;
    const bySymbol = new Map<string, Trade[]>();
    for (const t of closed) {
      if (closedAt(t) < since || !isLoss(t)) continue;
      const arr = bySymbol.get(t.ticker) ?? [];
      arr.push(t);
      bySymbol.set(t.ticker, arr);
    }
    for (const [symbol, arr] of bySymbol) {
      if (arr.length < losses) continue;
      const until = lockUntil(arr.map(closedAt), lockDays * MS_DAY, lookbackDays * MS_DAY);
      if (until > now) {
        locks.push({
          id: `symbol-${symbol}`,
          scope: "symbol",
          symbol,
          until: new Date(until).toISOString(),
          reason: `${arr.length} losses in ${symbol} within ${lookbackDays} days.`,
          remedy: "This name is not working for you. Let it go for a while.",
        });
      }
    }
  }

  return locks;
}

/** The lock (if any) that blocks opening new risk in `symbol` right now. */
export function lockFor(locks: Lock[], symbol?: string): Lock | null {
  const global = locks.find((l) => l.scope === "global");
  if (global) return global;
  if (!symbol) return null;
  return locks.find((l) => l.scope === "symbol" && l.symbol === symbol) ?? null;
}

export function describeRemaining(until: string, now = Date.now()): string {
  const ms = new Date(until).getTime() - now;
  if (ms <= 0) return "expired";
  if (ms > 300 * MS_DAY) return "until resolved";
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.ceil(h / 24)} day${h >= 48 ? "s" : ""}`;
  if (h >= 1) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${Math.max(1, Math.round(ms / MS_MIN))} min`;
}
