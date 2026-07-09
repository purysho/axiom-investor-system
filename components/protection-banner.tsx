"use client";

import Link from "next/link";
import { Lock as LockIcon } from "lucide-react";
import { describeRemaining, evaluateProtections, type Lock } from "@/lib/engine/protections";
import { useAppState } from "@/lib/store";

/** Shows behavioural locks — the ones caused by your own trading, not the market. */
export function ProtectionBanner({ symbol }: { symbol?: string }) {
  const state = useAppState();
  const locks = evaluateProtections(state);
  const shown: Lock[] = symbol
    ? locks.filter((l) => l.scope === "global" || l.symbol === symbol)
    : locks;
  if (shown.length === 0) return null;

  return (
    <div className="grid gap-2">
      {shown.map((l) => (
        <div
          key={l.id}
          className="flex items-start gap-3 rounded-[16px] border px-4 py-3.5"
          style={{ borderColor: "#4A3A16", background: "#241C0E" }}
        >
          <LockIcon size={17} className="mt-0.5 shrink-0" style={{ color: "#F0B429" }} />
          <div className="flex-1 text-sm">
            <div className="font-semibold" style={{ color: "#F0B429" }}>
              {l.scope === "symbol" ? `${l.symbol} is locked` : "New entries are locked"}
              <span className="ml-2 font-normal text-faint">· {describeRemaining(l.until)}</span>
            </div>
            <p className="mt-1 leading-relaxed text-mut">{l.reason}</p>
            {l.remedy && <p className="mt-1 leading-relaxed text-faint">{l.remedy}</p>}
            {l.id === "reflections" && (
              <Link href="/journal" className="quiet-link mt-2 inline-flex text-xs">Finish the reflection →</Link>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
