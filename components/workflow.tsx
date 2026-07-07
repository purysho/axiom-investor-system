"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { evaluateGate } from "@/lib/engine/gate";
import { todayKey, isoWeekKey, useAppState } from "@/lib/store";

const STEPS = [
  { n: 1, label: "Gate", href: "/gate", key: "gate" },
  { n: 2, label: "Daily check", href: "/daily", key: "daily" },
  { n: 3, label: "Positions", href: "/journal", key: "journal" },
  { n: 4, label: "Portfolio", href: "/portfolio", key: "portfolio" },
  { n: 5, label: "Watchlist", href: "/watchlist", key: "watchlist" },
];

const AUTH_PATHS = ["/login", "/join"];

export function WorkflowBar() {
  const path = usePathname();
  const state = useAppState();
  if (AUTH_PATHS.includes(path)) return null;

  const today = todayKey();
  const week = isoWeekKey();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const hasDailyCheck = Boolean(state.dailyChecks[today]);
  const openTrades = state.trades.filter((t) => t.status === "Open");
  const hasReviewed = state.weeklyReviews.includes(week);

  const statuses: Record<string, "done" | "active" | "pending"> = {
    gate: state.gateInputs.asOf ? "done" : "pending",
    daily: hasDailyCheck ? "done" : "pending",
    journal: openTrades.length === 0 ? "done" : "pending",
    portfolio: hasReviewed ? "done" : "pending",
    watchlist: "pending",
  };

  // Find the first incomplete step as "active"
  const firstPending = STEPS.find((s) => statuses[s.key] === "pending");
  if (firstPending) statuses[firstPending.key] = "active";

  const currentStep = STEPS.find((s) => s.href === path);

  return (
    <div className="panel mb-3 flex items-center gap-px overflow-x-auto">
      {STEPS.map((s, i) => {
        const status = statuses[s.key];
        const isCurrent = s.href === path;
        const color =
          status === "done" ? "#2FBF8F" :
          status === "active" ? "var(--gate)" :
          "#55636F";
        return (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-1 items-center gap-2 px-3 py-2 transition-colors hover:bg-panel2 min-w-0"
            style={{ borderBottom: isCurrent ? "2px solid var(--gate)" : "2px solid transparent" }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-semibold"
              style={{
                background: status === "done" ? "#2FBF8F22" : status === "active" ? "color-mix(in srgb, var(--gate) 15%, transparent)" : "#55636F15",
                color,
              }}
            >
              {status === "done" ? "✓" : s.n}
            </span>
            <span className="truncate font-mono text-[11px]" style={{ color: isCurrent ? "var(--ink)" : color }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="ml-auto shrink-0 text-faint" aria-hidden>›</span>
            )}
          </Link>
        );
      })}
      {currentStep && (
        <div className="hidden shrink-0 border-l border-line px-3 py-2 md:block">
          <div className="eyebrow">step {currentStep.n} of {STEPS.length}</div>
        </div>
      )}
    </div>
  );
}
