import type { GateResult, Trade, WatchData, WatchRule } from "./types";

/** Deterministic suggestion for the daily required output. The user can edit both halves. */
export function suggestPermittedAction(
  gate: GateResult,
  trades: Trade[],
): { action: string; because: string } {
  const open = trades.filter((t) => t.status === "Open").length;
  const failed = gate.checks.filter((c) => !c.pass).map((c) => c.label.toLowerCase());

  if (gate.state === "RISK ALLOWED") {
    return {
      action: "run the existing approved watchlist after current-position review",
      because: "all six gate checks pass and planned open risk is within budget",
    };
  }
  if (gate.state === "REDUCED RISK ONLY") {
    return {
      action:
        open > 0
          ? "manage existing positions; reduced size only, with a documented exception"
          : "reduced size only, with a documented exception — or stand aside",
      because: `one gate check failed (${failed[0] ?? "one check"})`,
    };
  }
  return {
    action: open > 0 ? "manage existing positions only — no candidate scanning" : "stand aside — no candidate scanning",
    because: `${gate.fails} gate checks failed (${failed.slice(0, 3).join(", ")})`,
  };
}

export interface FiredAlert {
  rule: WatchRule;
  current: number | null;
  fired: boolean;
  awaiting: boolean;
}

const OPS: Record<WatchRule["op"], (a: number, b: number) => boolean> = {
  ">": (a, b) => a > b,
  "<": (a, b) => a < b,
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
};

/**
 * Port of tickerbot's check_alerts.py: compare rules to the latest data block.
 * States facts only — a metric crossed a level. Never a directive.
 */
export function checkAlerts(rules: WatchRule[], data: WatchData): FiredAlert[] {
  return rules.map((rule) => {
    const row = data.rows.find((r) => r.ticker.toUpperCase() === rule.ticker.toUpperCase());
    const current = row?.values[rule.metric] ?? null;
    if (current === null || current === undefined) {
      return { rule, current: null, fired: false, awaiting: true };
    }
    return { rule, current, fired: OPS[rule.op](current, rule.value), awaiting: false };
  });
}
