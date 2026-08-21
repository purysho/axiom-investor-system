"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Activity, Cpu, ShieldCheck, Wallet } from "lucide-react";
import { fmtPct, fmtUsd } from "@/components/chrome";
import { buildOverview } from "@/lib/engine/overview";
import { gateColorVar } from "@/lib/engine/gate";
import { useAppState } from "@/lib/store";
import { usePolling } from "@/lib/use-polling";
import type { AccountSummary } from "@/lib/broker/account-summary";

/**
 * The Today dashboard strip: one calm row with the numbers the system runs
 * on — gate, risk budget in use, behavioural locks, paper account, last bot
 * run. Server data refreshes gently (5 min, visible tabs only); everything
 * else derives from local state instantly.
 */

interface LivePayload { connected: boolean; mode?: string; summary?: AccountSummary }
interface BotRunLite { outcome: string; summary: string; startedAt: string }
interface BotPayload { runs?: BotRunLite[] }

export function StatusStrip() {
  const state = useAppState();
  const ov = buildOverview(state);
  const [live, setLive] = useState<LivePayload | null>(null);
  const [lastRun, setLastRun] = useState<BotRunLite | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [posRes, botRes] = await Promise.all([fetch("/api/broker/positions"), fetch("/api/bot")]);
      if (posRes.ok) setLive((await posRes.json()) as LivePayload);
      if (botRes.ok) {
        const j = (await botRes.json()) as BotPayload;
        setLastRun(j.runs?.[0] ?? null);
      }
    } catch { /* strip degrades to local-only */ }
  }, []);
  usePolling(refresh, 5 * 60_000);

  const tiles: Array<{ key: string; href: string; Icon: typeof Activity; label: string; value: string; sub: string; color?: string }> = [
    {
      key: "gate", href: "/gate", Icon: ShieldCheck,
      label: "Risk gate",
      value: ov.gateState.toLowerCase(),
      sub: `${ov.gateChecksClear}/${ov.gateChecksTotal} checks clear`,
      color: gateColorVar(ov.gateState),
    },
    {
      key: "risk", href: "/journal", Icon: Activity,
      label: "Risk in use",
      value: `${fmtUsd(ov.openRiskUsd)} · ${fmtPct(ov.openRiskPct)}`,
      sub: ov.heatUsedPct === null ? `${ov.openTrades} open trades` : `${fmtPct(Math.min(999, ov.heatUsedPct), 0)} of heat budget · ${ov.openTrades} open`,
      color: ov.heatUsedPct !== null && ov.heatUsedPct >= 100 ? "#F4645C" : undefined,
    },
  ];

  if (ov.killSwitch || ov.activeLocks > 0) {
    tiles.push({
      key: "locks", href: "/copilot", Icon: ShieldCheck,
      label: "Protections",
      value: ov.killSwitch ? "kill switch ON" : `${ov.activeLocks} lock${ov.activeLocks === 1 ? "" : "s"} active`,
      sub: ov.reflectionsDue > 0 ? `${ov.reflectionsDue} reflection${ov.reflectionsDue === 1 ? "" : "s"} owed` : "your own rules, enforced",
      color: "#F0B429",
    });
  }

  if (live?.connected && live.summary) {
    tiles.push({
      key: "account", href: "/bot", Icon: Wallet,
      label: `Paper account`,
      value: fmtUsd(live.summary.equity),
      sub: live.summary.unrealizedPl === null
        ? `${live.summary.positionCount} positions`
        : `${live.summary.unrealizedPl >= 0 ? "+" : ""}${fmtUsd(live.summary.unrealizedPl)} unrealized · ${live.summary.positionCount} pos`,
      color: live.summary.unrealizedPl !== null ? (live.summary.unrealizedPl >= 0 ? "#34D399" : "#F4645C") : undefined,
    });
  }

  if (lastRun) {
    tiles.push({
      key: "bot", href: "/bot", Icon: Cpu,
      label: "AXIOM bot",
      value: lastRun.outcome.replace("-", " "),
      sub: new Date(lastRun.startedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    });
  }

  return (
    <section className="mb-10 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="System status">
      {tiles.slice(0, 4).map(({ key, href, Icon, label, value, sub, color }) => (
        <Link key={key} href={href} className="group rounded-[16px] bg-panel p-4 transition-colors hover:bg-panel2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-mut"><Icon size={13} /> {label}</div>
          <div className="mt-1.5 truncate font-display text-lg font-semibold tracking-[-0.02em]" style={{ color }}>{value}</div>
          <div className="mt-0.5 truncate text-xs text-faint">{sub}</div>
        </Link>
      ))}
    </section>
  );
}
