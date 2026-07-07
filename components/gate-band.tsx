"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { evaluateGate, gateColorVar } from "@/lib/engine/gate";
import { useAppState } from "@/lib/store";

/**
 * The signature element: a persistent strip whose evaluated state recolors the
 * entire interface via --gate, and whose verdict every page defers to.
 */
export default function GateBand() {
  const path = usePathname();
  const state = useAppState();
  const gate = evaluateGate(state.gateInputs, state.settings, state.trades);
  const color = gateColorVar(gate.state);

  useEffect(() => {
    document.documentElement.style.setProperty("--gate", color);
  }, [color]);

  if (path === "/login" || path === "/join") return null;

  return (
    <Link
      href="/gate"
      aria-label={`Risk gate: ${gate.state}. Open gate page.`}
      className="panel flex flex-wrap items-center gap-x-4 gap-y-1 border-l-4 px-3 py-2"
      style={{ borderLeftColor: color }}
    >
      <span className="font-mono text-sm font-semibold tracking-wide" style={{ color }}>
        {gate.state}
      </span>
      <span className="flex items-center gap-1.5" aria-hidden>
        {gate.checks.map((c) => (
          <span
            key={c.id}
            title={`${c.label}: ${c.current} (needs ${c.threshold})`}
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: c.pass ? "#2FBF8F" : c.unknown ? "transparent" : "#E5484D",
              border: c.pass ? "none" : `1px solid ${c.unknown ? "#55636F" : "#E5484D"}`,
            }}
          />
        ))}
      </span>
      <span className="font-mono text-[11px] text-mut">
        {gate.fails === 0
          ? "all checks pass"
          : `${gate.fails} check${gate.fails > 1 ? "s" : ""} failing${gate.unknowns ? ` · ${gate.unknowns} awaiting data` : ""}`}
      </span>
      {state.gateInputs.asOf ? (
        <span className="ml-auto font-mono text-[11px] text-faint">
          as of {state.gateInputs.asOf}
          {state.gateInputs.source ? ` · ${state.gateInputs.source}` : ""}
        </span>
      ) : (
        <span className="ml-auto font-mono text-[11px] text-faint">inputs on the gate page →</span>
      )}
    </Link>
  );
}
