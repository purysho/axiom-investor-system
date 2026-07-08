import { evaluateGate } from "@/lib/engine/gate";
import { journalStats, plannedRiskUsd, portfolioStats, rMultiple } from "@/lib/engine/stats";
import type { AppState } from "@/lib/engine/types";
import { todayKey } from "@/lib/store";

/**
 * Build the compact plain-text snapshot of the user's Axiom state that is sent
 * to the model with each assistant request. Plain text beats JSON here: fewer
 * tokens, and the model reads it the way a colleague would read a briefing.
 *
 * Hard rules: cap every list, cap total size, never include passphrases,
 * invite codes, or other people's group data.
 */
export function buildAssistantSnapshot(state: AppState): string {
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const js = journalStats(state.trades);
  const ps = portfolioStats(state.holdings);
  const today = todayKey();
  const check = state.dailyChecks[today];

  const lines: string[] = [];

  lines.push(`DATE: ${today}`);
  lines.push("");
  lines.push(`RISK CHECK (the gate): ${gate.state} — ${gate.fails} failing, ${gate.unknowns} awaiting data.`);
  for (const c of gate.checks) {
    lines.push(`- ${c.label}: ${c.pass ? "clear" : c.unknown ? "not known" : "FAILING"} (now: ${c.current}; rule: ${c.threshold})`);
  }
  if (state.gateInputs.asOf) lines.push(`Market data as of ${state.gateInputs.asOf} (${state.gateInputs.source || "manual"}). Delayed EOD.`);
  else lines.push("Market data has not been fetched yet — unknown inputs count as not passing.");

  lines.push("");
  lines.push(`PROFILE: portfolio $${state.settings.portfolioValue.toLocaleString()}, benchmark ${state.settings.benchmarkName}, risk/trade ${state.settings.riskPerTradePct}% (1R = $${Math.round((state.settings.riskPerTradePct / 100) * state.settings.portfolioValue).toLocaleString()}), single-position cap ${state.settings.notionalCapPct}%, heat cap ${state.settings.heatCapPct}%.`);

  lines.push("");
  lines.push(`TODAY'S CHECK: ${check ? `saved at ${new Date(check.savedAt).toLocaleTimeString()} — permitted action: "${check.action}" because ${check.because}` : "not done yet"}.`);

  const open = state.trades.filter((t) => t.status === "Open").slice(0, 10);
  lines.push("");
  lines.push(`OPEN SWING TRADES (${state.trades.filter((t) => t.status === "Open").length}):`);
  if (open.length === 0) lines.push("- none");
  for (const t of open) {
    lines.push(`- ${t.ticker} ${t.direction}, entry ${t.entry ?? "?"}, stop ${t.stop ?? "?"}, target ${t.target ?? "—"}, ${t.shares ?? "?"} sh, planned risk $${Math.round(plannedRiskUsd(t) ?? 0)}, gate at entry: ${t.gateAtEntry || "?"}`);
  }

  const needReflection = state.trades.filter((t) => t.status === "Closed" && (!t.lesson || !t.ruleFollowed));
  lines.push("");
  lines.push(`JOURNAL: ${js.closedCount} closed. Win rate ${js.winRatePct?.toFixed(0) ?? "—"}%, expectancy ${js.expectancyR?.toFixed(2) ?? "—"}R, adherence ${js.adherencePct?.toFixed(0) ?? "—"}%. ${needReflection.length} closed trade(s) still need a reflection${needReflection.length ? ` (${needReflection.slice(0, 5).map((t) => t.ticker).join(", ")})` : ""}.`);
  const recent = state.trades.filter((t) => t.status === "Closed" && t.lesson).slice(-4);
  for (const t of recent) {
    const r = rMultiple(t);
    lines.push(`- ${t.ticker} ${r !== null ? `${r >= 0 ? "+" : ""}${r.toFixed(1)}R` : ""}, plan followed: ${t.ruleFollowed || "?"}, mistake: ${t.mistakeTag || "—"} — lesson: "${(t.lesson || "").slice(0, 140)}"`);
  }
  if (js.leakFlags.length) lines.push(`Repeated leak tags: ${js.leakFlags.map(([tag, n]) => `${tag} ×${n}`).join(", ")}.`);

  lines.push("");
  lines.push(`PORTFOLIO (${state.holdings.length} holdings, $${Math.round(ps.totalMarketValue).toLocaleString()} priced value, yield ${ps.portfolioYieldPct?.toFixed(1) ?? "—"}%):`);
  for (const h of state.holdings.slice(0, 12)) {
    const row = ps.rows.find((r) => r.id === h.id);
    lines.push(`- ${h.ticker} (${h.sleeve}) weight ${row?.weightPct?.toFixed(1) ?? "?"}% vs target ${h.targetWeightPct ?? "—"}%, thesis: ${h.thesisStatus || "—"}${h.payoutGrade ? `, payout grade ${h.payoutGrade}` : ""}`);
  }
  if (state.holdings.length > 12) lines.push(`- …and ${state.holdings.length - 12} more`);

  if (state.watchRules.length) {
    lines.push("");
    lines.push(`TRADE-IDEA RULES (${state.watchRules.length}):`);
    for (const r of state.watchRules.slice(0, 10)) lines.push(`- ${r.ticker}: ${r.metric} ${r.op} ${r.value}${r.note ? ` (${r.note})` : ""}`);
  }

  let text = lines.join("\n");
  if (text.length > 5500) text = text.slice(0, 5500) + "\n[snapshot truncated]";
  return text;
}
