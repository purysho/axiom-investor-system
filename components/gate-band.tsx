"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, ShieldOff, ArrowRight } from "lucide-react";
import { evaluateGate, gateColorVar, gateBgVar } from "@/lib/engine/gate";
import { useAppState } from "@/lib/store";

const META = {
  "RISK ALLOWED":      { Icon: ShieldCheck,  desc: "All checks pass — new positions permitted" },
  "REDUCED RISK ONLY": { Icon: ShieldAlert,  desc: "One check failing — reduce size or stand aside" },
  "NO NEW SWINGS":     { Icon: ShieldOff,    desc: "Two or more checks failing — manage existing only" },
} as const;

const AUTH_PATHS = ["/login", "/join"];

export default function GateBand() {
  const path  = usePathname();
  const state = useAppState();
  const gate  = evaluateGate(state.gateInputs, state.settings, state.trades);
  const color = gateColorVar(gate.state);
  const bg    = gateBgVar(gate.state);

  useEffect(() => {
    document.documentElement.style.setProperty("--gate", color);
    document.documentElement.style.setProperty("--gate-bg", bg);
  }, [color, bg]);

  if (AUTH_PATHS.includes(path)) return null;

  const { Icon, desc } = META[gate.state as keyof typeof META] ?? META["RISK ALLOWED"];

  return (
    <Link
      href="/gate"
      aria-label={`Risk gate: ${gate.state}. ${desc}.`}
      className="group flex items-center gap-4 rounded-xl px-5 py-4 mb-5 transition-all hover:shadow-card-hover"
      style={{ background: bg, border: `1.5px solid color-mix(in srgb, ${color} 25%, transparent)` }}
    >
      {/* Icon in coloured circle */}
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 12%, white)` }}
      >
        <Icon size={20} style={{ color }} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm" style={{ color }}>{gate.state}</div>
        <div className="text-xs text-mut mt-0.5">{desc}</div>
      </div>

      {/* Status pips */}
      <div className="hidden sm:flex items-center gap-2 shrink-0" aria-hidden>
        {gate.checks.map((c) => (
          <div key={c.id} className="flex flex-col items-center gap-1" title={`${c.label}: ${c.current}`}>
            <div
              className="h-2 w-2 rounded-full"
              style={{
                background: c.pass ? "#1A6B47" : c.unknown ? "#D5CEC5" : "#C0252A",
                opacity: c.unknown ? 0.5 : 1,
              }}
            />
          </div>
        ))}
      </div>

      {/* As-of */}
      <div className="hidden lg:block text-right shrink-0">
        <div className="text-xs text-faint">
          {state.gateInputs.asOf ? state.gateInputs.asOf : "Tap to update →"}
        </div>
      </div>

      <ArrowRight size={14} className="text-faint group-hover:text-mut transition-colors shrink-0" />
    </Link>
  );
}
