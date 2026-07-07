"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { isoWeekKey, todayKey, useAppState } from "@/lib/store";

const STEPS = [
  { n: 1, label: "Risk gate",   sub: "Check conditions", href: "/gate",      key: "gate" },
  { n: 2, label: "Daily check", sub: "15-min scan",      href: "/daily",     key: "daily" },
  { n: 3, label: "Positions",   sub: "Open trades",      href: "/journal",   key: "journal" },
  { n: 4, label: "Portfolio",   sub: "Holdings",         href: "/portfolio", key: "portfolio" },
  { n: 5, label: "Watchlist",   sub: "Candidates",       href: "/watchlist", key: "watchlist" },
];

const AUTH_PATHS = ["/login", "/join"];

export function WorkflowBar() {
  const path  = usePathname();
  const state = useAppState();
  if (AUTH_PATHS.includes(path)) return null;

  const today = todayKey();
  const week  = isoWeekKey();

  const done: Record<string, boolean> = {
    gate:      Boolean(state.gateInputs.asOf),
    daily:     Boolean(state.dailyChecks[today]),
    journal:   state.trades.filter((t) => t.status === "Open").length === 0,
    portfolio: state.weeklyReviews.includes(week),
    watchlist: false,
  };

  const doneCount  = Object.values(done).filter(Boolean).length;
  const nextStep   = STEPS.find((s) => !done[s.key]);
  const pct        = (doneCount / STEPS.length) * 100;

  return (
    <div className="mb-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-ink">Today's workflow</span>
        <span className="text-xs text-faint">
          {doneCount === STEPS.length ? "All done ✓" : `${doneCount} of ${STEPS.length} complete`}
        </span>
      </div>

      {/* Progress track */}
      <div className="relative mb-4">
        <div className="h-1.5 rounded-full bg-line overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, background: "var(--gate)" }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-5 gap-2">
        {STEPS.map((s) => {
          const isDone    = done[s.key];
          const isCurrent = path === s.href;
          const isNext    = nextStep?.key === s.key;

          return (
            <Link
              key={s.href}
              href={s.href}
              className="group flex flex-col gap-2 rounded-xl p-3 transition-all"
              style={
                isCurrent
                  ? { background: "var(--gate-bg)", border: `1.5px solid color-mix(in srgb, var(--gate) 30%, transparent)` }
                  : isDone
                  ? { background: "#F0FAF5", border: "1.5px solid #BDE8D4" }
                  : isNext
                  ? { background: "#FAFAF8", border: "1.5px solid #E5DDD3", boxShadow: "0 0 0 3px color-mix(in srgb, var(--gate) 10%, transparent)" }
                  : { background: "#FAFAF8", border: "1.5px solid #E5DDD3", opacity: 0.75 }
              }
            >
              {/* Icon / number */}
              {isDone ? (
                <CheckCircle2 size={16} style={{ color: "#1A6B47" }} />
              ) : (
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
                  style={
                    isCurrent || isNext
                      ? { background: "color-mix(in srgb, var(--gate) 15%, white)", color: "var(--gate)" }
                      : { background: "#EDE8E3", color: "#A99F96" }
                  }
                >
                  {s.n}
                </div>
              )}

              {/* Labels */}
              <div>
                <div className={`text-xs font-semibold leading-tight ${isDone ? "text-allowed" : isCurrent ? "text-ink" : "text-mut"}`}>
                  {s.label}
                </div>
                <div className="text-[10px] text-faint mt-0.5 hidden sm:block">{s.sub}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
