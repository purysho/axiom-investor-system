import { createHash } from "node:crypto";
import { evaluateGate } from "@/lib/engine/gate";
import { describeRemaining, evaluateProtections, lockFor } from "@/lib/engine/protections";
import { WARMUP_BARS } from "@/lib/engine/quotes";
import { latestSignal } from "@/lib/engine/strategy";
import type { AppState, Trade } from "@/lib/engine/types";
import { validateRecommendation } from "@/lib/copilot/validate";
import type { Recommendation } from "@/lib/copilot/types";
import { preflight } from "@/lib/broker/preflight";
import { BrokerError } from "@/lib/broker/types";
import { audit } from "./audit";
import { getBroker, getConnection, ordersToday } from "./broker-store";
import { db } from "./db";
import { executeVerifiedOrder } from "./execute-order";
import { fetchDailyHistory } from "./history";
import { loadUserState } from "./user-state";

/**
 * The AXIOM bot — the autopilot the Copilot page promised would stay locked
 * until it was earned. It runs the SAME pipeline a human run of the Copilot
 * does: shared strategy engine → deterministic validator (gate, protections,
 * sizing, heat cap, concurrency) → live-state preflight → idempotent order.
 * The only thing removed is the click.
 *
 * Hard invariants, enforced here and not configurable anywhere:
 *  1. PAPER ONLY. A live-mode broker connection stands the bot down. Real
 *     money keeps a human on the trigger, full stop.
 *  2. No synced state, no trades. The bot cannot verify the gate or the
 *     protections without it, and a missing state is not a green light.
 *  3. The kill switch in the user's own settings wins over everything.
 *  4. Every run is logged, especially the ones that traded nothing.
 */

const MAX_ORDERS_PER_DAY = 5; // same discipline cap the manual route enforces

export interface BotSettings {
  enabled: boolean;
  universe: string[];
  maxOrdersPerRun: number;
}

export const DEFAULT_BOT_SETTINGS: BotSettings = { enabled: false, universe: [], maxOrdersPerRun: 1 };

export interface BotCheck { name: string; ok: boolean; note: string }
export interface BotOrderReport {
  symbol: string; qty: number; entry: number; stop: number; takeProfit: number | null;
  clientOrderId: string; status: string; note: string;
}
export interface BotRunReport {
  outcome: "traded" | "stood-down" | "no-signal" | "dry-run" | "error";
  summary: string;
  checks: BotCheck[];
  signals: { symbol: string; strategy: string; entry: number; stop: number; note: string }[];
  orders: BotOrderReport[];
}

const SYMBOL_RE = /^[A-Za-z0-9.^-]{1,12}$/;

export async function getBotSettings(userId: string): Promise<BotSettings> {
  const c = await db();
  const r = (await c.execute({ sql: "SELECT enabled, universe, max_orders_per_run FROM bot_settings WHERE user_id = ?", args: [userId] })).rows[0];
  if (!r) return { ...DEFAULT_BOT_SETTINGS };
  let universe: string[] = [];
  try { universe = (JSON.parse(String(r.universe)) as unknown[]).filter((s): s is string => typeof s === "string" && SYMBOL_RE.test(s)); } catch { /* reset below */ }
  return {
    enabled: Number(r.enabled) === 1,
    universe,
    maxOrdersPerRun: Math.max(1, Math.min(3, Number(r.max_orders_per_run) || 1)),
  };
}

export async function saveBotSettings(userId: string, s: BotSettings): Promise<void> {
  const c = await db();
  const now = new Date().toISOString();
  await c.execute({
    sql: `INSERT INTO bot_settings (user_id, enabled, universe, max_orders_per_run, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET enabled = excluded.enabled, universe = excluded.universe,
            max_orders_per_run = excluded.max_orders_per_run, updated_at = excluded.updated_at`,
    args: [userId, s.enabled ? 1 : 0, JSON.stringify(s.universe.slice(0, 8)), s.maxOrdersPerRun, now, now],
  });
}

export async function listBotRuns(userId: string, limit = 20) {
  const c = await db();
  const res = await c.execute({
    sql: "SELECT id, trigger_source, started_at, finished_at, outcome, summary, detail, orders_placed FROM bot_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT ?",
    args: [userId, limit],
  });
  return res.rows.map((r) => ({
    id: Number(r.id),
    triggerSource: String(r.trigger_source),
    startedAt: String(r.started_at),
    finishedAt: r.finished_at ? String(r.finished_at) : null,
    outcome: String(r.outcome),
    summary: String(r.summary),
    detail: safeJson(String(r.detail)),
    ordersPlaced: Number(r.orders_placed),
  }));
}

export async function listEnabledBotUsers(): Promise<string[]> {
  const c = await db();
  const res = await c.execute("SELECT user_id FROM bot_settings WHERE enabled = 1");
  return res.rows.map((r) => String(r.user_id));
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return {}; }
}

/** Deterministic, ≤48-char idempotency key: one order per user per symbol per day. */
export function botClientOrderId(userId: string, symbol: string, date: string): string {
  const userHash = createHash("sha256").update(userId).digest("hex").slice(0, 8);
  const cleanSymbol = symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
  return `axiom-bot-${userHash}-${date.replace(/-/g, "")}-${cleanSymbol}`;
}

function serverUid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`.toUpperCase();
}

/** Append the bot's trade + recommendation to the user's synced state so the
 *  journal, the gate's open-risk check, and the protections all see it. */
async function recordTradeInState(userId: string, state: AppState, rec: Recommendation, filled: { qty: number | null; price: number | null }) {
  const trade: Trade = {
    id: serverUid("T"),
    status: "Open",
    gateAtEntry: rec.macro.gateState as Trade["gateAtEntry"],
    strategy: rec.strategy === "Mean reversion" ? "Mean Reversion" : "Pullback",
    ticker: rec.asset,
    direction: "Long",
    sleeve: "Satellite",
    entryDate: new Date().toISOString().slice(0, 10),
    exitDate: "",
    entry: filled.price ?? rec.entry,
    stop: rec.stop,
    target: rec.takeProfits[0] ?? null,
    shares: filled.qty || rec.positionSize,
    exitPrice: null, fees: null, mfePct: null, maePct: null,
    thesisGrade: "", emotion: null, ruleFollowed: "", exitReason: "", mistakeTag: "",
    thesis: `AXIOM bot: ${rec.evidence[0] ?? rec.strategy}`,
    lesson: "", nextRuleChange: "",
    tags: "copilot;bot;paper",
    exceptionNote: rec.macro.gateState === "REDUCED RISK ONLY" ? "Bot entry under REDUCED RISK ONLY (half size)." : undefined,
  };
  const next: AppState = {
    ...state,
    trades: [...state.trades, trade],
    recommendations: [...state.recommendations, { ...rec, status: "approved" as const, executedTradeId: trade.id }].slice(-60),
  };
  const c = await db();
  await c.execute({
    sql: `INSERT INTO states (user_id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [userId, JSON.stringify(next), new Date().toISOString()],
  });
  return next;
}

export async function runBotForUser(userId: string, source: "manual" | "cron", dryRun = false): Promise<BotRunReport> {
  const c = await db();
  const startedAt = new Date().toISOString();
  const runRow = await c.execute({
    sql: "INSERT INTO bot_runs (user_id, trigger_source, started_at, outcome) VALUES (?, ?, ?, 'running')",
    args: [userId, source, startedAt],
  });
  const runId = Number(runRow.lastInsertRowid);

  const report: BotRunReport = { outcome: "error", summary: "", checks: [], signals: [], orders: [] };
  const check = (name: string, ok: boolean, note: string) => { report.checks.push({ name, ok, note }); return ok; };

  const finish = async (outcome: BotRunReport["outcome"], summary: string) => {
    report.outcome = outcome;
    report.summary = summary;
    await c.execute({
      sql: "UPDATE bot_runs SET finished_at = ?, outcome = ?, summary = ?, detail = ?, orders_placed = ? WHERE id = ?",
      args: [new Date().toISOString(), outcome, summary.slice(0, 300), JSON.stringify(report).slice(0, 20_000), report.orders.filter((o) => o.status !== "blocked").length, runId],
    });
    return report;
  };

  try {
    const settings = await getBotSettings(userId);

    // ── Interlocks, in the order a human would hit them ─────────────────────
    let state = await loadUserState(userId);
    if (!check("synced state", state !== null, state ? "found" : "No synced state on the server — the bot refuses to trade on unverified risk settings."))
      return finish("stood-down", "No synced state — sign in once so your rules sync, then the bot can verify them.");
    state = state as AppState;

    if (!check("kill switch", !state.copilot.killSwitch, state.copilot.killSwitch ? "Kill switch is ON." : "off"))
      return finish("stood-down", "Your kill switch is on. The bot does nothing until you turn it off.");

    const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
    if (!check("risk gate", gate.state !== "NO NEW SWINGS", gate.state))
      return finish("stood-down", "The risk gate says NO NEW SWINGS today. Standing down is the strategy.");

    const locks = evaluateProtections(state);
    const globalLock = lockFor(locks);
    if (!check("protections", globalLock === null, globalLock ? `${globalLock.reason} (${describeRemaining(globalLock.until)})` : "clear"))
      return finish("stood-down", `Behavioural protection active: ${globalLock!.reason}`);

    const conn = await getConnection(userId);
    const broker = await getBroker(userId);
    if (!check("broker", conn !== null && broker !== null, conn ? `${conn.broker} · ${conn.mode}` : "No broker connected."))
      return finish("stood-down", "No broker connected. Connect Alpaca paper keys in Settings.");

    // The invariant. Not a setting, not an env flag — the bot does not trade live money.
    if (!check("paper only", conn!.mode === "paper", conn!.mode === "paper" ? "paper account" : "LIVE account connected — the bot only trades paper."))
      return finish("stood-down", "Your broker connection is LIVE. The AXIOM bot only ever trades paper accounts; switch the connection to paper to use it.");

    let clock;
    try { clock = await broker!.getClock(); } catch (e) {
      check("market clock", false, e instanceof BrokerError ? e.message : "unreachable");
      return finish("error", "Couldn't reach the broker to check the market clock. Nothing was submitted.");
    }
    if (!check("market open", clock.isOpen, clock.isOpen ? "open" : `closed${clock.nextOpen ? ` — reopens ${clock.nextOpen}` : ""}`))
      return finish("stood-down", "Market is closed. The bot does not queue orders into the open.");

    const submittedToday = await ordersToday(userId);
    if (!check("daily cap", submittedToday < MAX_ORDERS_PER_DAY, `${submittedToday}/${MAX_ORDERS_PER_DAY} today`))
      return finish("stood-down", `Daily order cap reached (${MAX_ORDERS_PER_DAY}). Discipline limit, not a broker one.`);

    // ── Universe: explicit bot list, else trade ideas + satellite holdings ──
    let universe = settings.universe;
    if (universe.length === 0) {
      const set = new Set<string>();
      for (const r of state.watchRules) set.add(r.ticker.toUpperCase());
      for (const h of state.holdings) if (h.sleeve === "Satellite") set.add(h.ticker.toUpperCase());
      universe = [...set];
    }
    universe = universe.filter((s) => SYMBOL_RE.test(s)).slice(0, 8);
    if (!check("universe", universe.length > 0, universe.length ? universe.join(", ") : "No symbols to scan — set a bot universe or add Trade ideas."))
      return finish("stood-down", "Nothing to scan. Give the bot a universe (or add tickers to Trade ideas).");

    // ── Scan with the shared strategy engine ───────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const histories = await Promise.all(universe.map(async (s) => ({ symbol: s, rows: await fetchDailyHistory(s, WARMUP_BARS) })));
    const candidates: Recommendation[] = [];
    for (const h of histories) {
      if (!h.rows || h.rows.length < 30) { report.signals.push({ symbol: h.symbol, strategy: "—", entry: 0, stop: 0, note: "no data" }); continue; }
      const sig = latestSignal(h.symbol, h.rows);
      if (!sig) continue;
      report.signals.push({ symbol: sig.symbol, strategy: sig.strategy, entry: sig.entry, stop: sig.stop, note: "signal" });
      candidates.push({
        id: `BOT-${today}-${sig.symbol}`,
        createdAt: new Date().toISOString(),
        expiry: new Date(Date.now() + 86400000).toISOString(),
        status: "proposed",
        asset: sig.symbol,
        market: "Equity",
        timeframe: "Daily",
        side: "Long",
        strategy: sig.strategy,
        entry: sig.entry,
        stop: sig.stop,
        takeProfits: [sig.takeProfit],
        positionSize: null,
        maxRiskUsd: null,
        confidence: sig.confidence,
        evidence: sig.evidence,
        invalidation: sig.invalidation,
        dataAsOf: sig.dataAsOf,
        technical: sig.technical,
        macro: { gateState: gate.state },
        sentiment: null,
        citations: ["Stooq daily history (delayed EOD)", "Deterministic strategy engine"],
        source: "rules",
        validation: { ok: false, notes: [] },
      });
    }
    if (candidates.length === 0) return finish("no-signal", "Scanned the universe — nothing met the entry rules today. Most days that's the right answer.");

    // ── Deterministic validator: gate interlock, sizing, heat cap, caps ─────
    const validated = candidates
      .map((r) => validateRecommendation(r, state as AppState))
      .filter((r) => r.validation.ok && r.entry !== null && r.stop !== null && (r.positionSize ?? 0) >= 1)
      .sort((a, b) => b.confidence - a.confidence);
    for (const r of candidates) {
      const v = validated.find((x) => x.id === r.id);
      if (!v) {
        const why = validateRecommendation(r, state as AppState).validation.notes[0] ?? "rejected";
        const s = report.signals.find((x) => x.symbol === r.asset);
        if (s) s.note = why;
      }
    }
    if (validated.length === 0) return finish("stood-down", "Signals found, but the risk engine rejected them all — see the run detail for each reason.");

    if (dryRun) {
      for (const rec of validated.slice(0, settings.maxOrdersPerRun)) {
        report.orders.push({
          symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!,
          takeProfit: rec.takeProfits[0] ?? null, clientOrderId: botClientOrderId(userId, rec.asset, today),
          status: "dry-run", note: "Would submit this paper order.",
        });
      }
      return finish("dry-run", `Dry run: would place ${report.orders.length} paper order${report.orders.length === 1 ? "" : "s"}. Nothing was submitted.`);
    }

    // ── Preflight + submit, one at a time, idempotent per symbol per day ────
    let placed = 0;
    for (const rec of validated.slice(0, settings.maxOrdersPerRun)) {
      const coid = botClientOrderId(userId, rec.asset, today);
      let pre;
      try {
        pre = await preflight(broker!, {
          symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!, side: "buy",
          mode: "paper", notionalCapPct: state.settings.notionalCapPct,
          ordersToday: await ordersToday(userId), maxOrdersPerDay: MAX_ORDERS_PER_DAY,
        });
      } catch (e) {
        report.orders.push({ symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!, takeProfit: rec.takeProfits[0] ?? null, clientOrderId: coid, status: "blocked", note: e instanceof BrokerError ? e.message : "preflight failed" });
        continue;
      }
      if (!pre.ok) {
        report.orders.push({ symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!, takeProfit: rec.takeProfits[0] ?? null, clientOrderId: coid, status: "blocked", note: pre.reasons[0] ?? "preflight refused" });
        continue;
      }

      const result = await executeVerifiedOrder({
        userId, broker: broker!, mode: "paper", clientOrderId: coid, recommendationId: rec.id,
        symbol: rec.asset, side: "buy", qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!,
        takeProfit: rec.takeProfits[0] ?? null,
      });

      if (result.kind === "duplicate") {
        report.orders.push({ symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!, takeProfit: rec.takeProfits[0] ?? null, clientOrderId: coid, status: "duplicate", note: "Already submitted today — idempotency held, no second order." });
        continue;
      }
      if (result.kind === "failed") {
        report.orders.push({ symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!, takeProfit: rec.takeProfits[0] ?? null, clientOrderId: coid, status: "failed", note: result.message });
        await audit("bot.order.failed", { userId, detail: `${rec.asset}: ${result.message}`.slice(0, 150) });
        continue;
      }

      placed++;
      report.orders.push({
        symbol: rec.asset, qty: rec.positionSize!, entry: rec.entry!, stop: rec.stop!,
        takeProfit: rec.takeProfits[0] ?? null, clientOrderId: coid,
        status: result.order.status, note: `paper ${result.order.status}`,
      });
      await audit("bot.order.submitted", { userId, detail: `paper: buy ${rec.positionSize} ${rec.asset} @${rec.entry} stop ${rec.stop} → ${result.order.status}` });
      // Feed the trade back into synced state so the gate's open-risk check,
      // the protections, and the journal all see what the bot just did.
      state = await recordTradeInState(userId, state, rec, {
        qty: result.order.filledQty || null,
        price: result.order.filledAvgPrice,
      });
    }

    if (placed === 0) return finish("stood-down", "Every candidate was blocked at preflight — see the run detail.");
    return finish("traded", `Placed ${placed} paper order${placed === 1 ? "" : "s"}: ${report.orders.filter((o) => o.status !== "blocked").map((o) => o.symbol).join(", ")}.`);
  } catch (e) {
    await audit("bot.run.error", { userId, detail: e instanceof Error ? e.message.slice(0, 150) : "unknown" });
    return finish("error", "The bot hit an unexpected error and stopped. Nothing further was submitted.");
  }
}
