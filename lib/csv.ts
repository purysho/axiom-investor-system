import { netPnl, plannedRiskUsd, rMultiple } from "./engine/stats";
import type { Holding, Trade } from "./engine/types";

/** Minimal RFC-4180-ish parser (quoted fields, embedded commas/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

const esc = (v: string | number | null | undefined): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const JOURNAL_COLUMNS = [
  "id",
  "date",
  "instrument",
  "direction",
  "bucket",
  "entry",
  "stop",
  "target",
  "size",
  "risk_usd",
  "emotion",
  "result_R",
  "followed_plan",
  "thesis",
  "lesson",
  "tags",
] as const;

/** Export in the companion skill's trading-journal.md ledger format. */
export function exportJournalCsv(trades: Trade[]): string {
  const lines = [JOURNAL_COLUMNS.join(",")];
  for (const t of trades) {
    if (t.status === "Cancelled") continue;
    const risk = plannedRiskUsd(t);
    const r = t.status === "Closed" ? rMultiple(t) : null;
    lines.push(
      [
        esc(t.id),
        esc(t.entryDate),
        esc(t.ticker),
        esc(t.direction.toLowerCase()),
        esc(t.sleeve === "Satellite" ? "swing" : t.sleeve.toLowerCase()),
        esc(t.entry),
        esc(t.stop),
        esc(t.target),
        esc(t.shares),
        esc(risk !== null ? Math.round(risk * 100) / 100 : ""),
        esc(t.emotion),
        esc(r !== null ? `${r >= 0 ? "+" : ""}${(Math.round(r * 100) / 100).toFixed(2)}` : ""),
        esc(t.status === "Closed" ? (t.ruleFollowed === "Yes" ? "Y" : t.ruleFollowed === "No" ? "N" : "") : ""),
        esc(t.thesis),
        esc(t.lesson),
        esc(t.tags),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

const num = (s: string): number | null => {
  const cleaned = s.trim().replace("\u2212", "-").replace("+", "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

/** Import the companion's 16-column ledger. result_R is reconstructed into exit fields when possible. */
export function importJournalCsv(text: string): Trade[] {
  const rows = parseCsv(text.trim());
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const out: Trade[] = [];
  for (const r of rows.slice(1)) {
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 && i < r.length ? r[i].trim() : "";
    };
    const entry = num(get("entry"));
    const stop = num(get("stop"));
    const shares = num(get("size"));
    const resultR = num(get("result_r"));
    const risk =
      num(get("risk_usd")) ??
      (entry !== null && stop !== null && shares !== null ? Math.abs(entry - stop) * shares : null);
    const closed = resultR !== null;
    const followedRaw = get("followed_plan").toUpperCase();
    const dirRaw = get("direction").toLowerCase();
    const direction = dirRaw.startsWith("s") ? "Short" : "Long";
    // Reconstruct an exit price consistent with result_R (fees folded in): net = R × risk.
    let exitPrice: number | null = null;
    if (closed && entry !== null && shares !== null && shares !== 0 && risk !== null) {
      const net = (resultR as number) * risk;
      exitPrice = direction === "Short" ? entry - net / shares : entry + net / shares;
      exitPrice = Math.round(exitPrice * 10000) / 10000;
    }
    out.push({
      id: get("id") || `T${Date.now()}${Math.floor(Math.random() * 1000)}`,
      status: closed ? "Closed" : "Open",
      gateAtEntry: "",
      strategy: "",
      ticker: get("instrument").toUpperCase(),
      direction,
      sleeve: "Satellite",
      entryDate: get("date"),
      exitDate: "",
      entry,
      stop,
      target: num(get("target")),
      shares,
      exitPrice,
      fees: closed ? 0 : null,
      mfePct: null,
      maePct: null,
      thesisGrade: "",
      emotion: num(get("emotion")),
      ruleFollowed: followedRaw === "Y" || followedRaw === "YES" ? "Yes" : followedRaw === "N" || followedRaw === "NO" ? "No" : "",
      exitReason: "",
      mistakeTag: "",
      thesis: get("thesis"),
      lesson: get("lesson"),
      nextRuleChange: "",
      tags: get("tags"),
    });
  }
  return out;
}

/** Export in the companion skill's portfolio.md ledger format. */
export function exportPortfolioCsv(holdings: Holding[]): string {
  const cols =
    "ticker,type,shares,cost_basis,price,target_weight_pct,expense_ratio_pct,yield_pct,payout_ratio_pct,notes";
  const lines = [cols];
  for (const h of holdings) {
    lines.push(
      [
        esc(h.ticker),
        esc(h.type.toLowerCase()),
        esc(h.shares),
        esc(h.costBasis),
        esc(h.price),
        esc(h.targetWeightPct),
        esc(h.expenseRatioPct),
        esc(h.yieldPct),
        esc(h.payoutRatioPct),
        esc(h.notes),
      ].join(","),
    );
  }
  return lines.join("\n") + "\n";
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
