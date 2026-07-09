"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Link2, Link2Off, RefreshCw } from "lucide-react";
import { toast } from "@/components/toast";

interface Status {
  connected: boolean;
  liveAllowed: boolean;
  mode?: "paper" | "live";
  keyHint?: string;
  ordersToday?: number;
  error?: string;
  account?: { equity: number; cash: number; buyingPower: number; currency: string; restricted: boolean; accountNumber: string };
  positions?: Array<{ symbol: string; qty: number; avgEntryPrice: number; unrealizedPl: number | null }>;
  clock?: { isOpen: boolean; nextOpen: string | null };
}

export function BrokerPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [keyId, setKeyId] = useState("");
  const [secret, setSecret] = useState("");
  const [mode, setMode] = useState<"paper" | "live">("paper");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/broker/status");
      if (res.ok) setStatus(await res.json());
    } catch { /* offline */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/broker/connect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId, secret, mode }),
      });
      const j = await res.json();
      if (!res.ok) { toast(j.error ?? "Couldn't connect.", "error"); return; }
      setKeyId(""); setSecret("");
      toast(`Connected to Alpaca (${j.mode}).`);
      await load();
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Forget your broker keys? Open positions are unaffected — Axiom just stops being able to see or trade them.")) return;
    await fetch("/api/broker/connect", { method: "DELETE" });
    toast("Broker disconnected.", "warning");
    await load();
  };

  const sync = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/broker/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) { toast(j.error ?? "Sync failed.", "error"); return; }
      toast(`Synced — ${j.resolved} resolved, ${j.stillOpen} still working${j.orphansFound ? `, ${j.orphansFound} never landed` : ""}.`);
      await load();
    } finally { setBusy(false); }
  };

  if (!status) return <p className="text-sm text-faint">Checking broker connection…</p>;

  if (!status.connected) {
    return (
      <div>
        <div className="flex items-center gap-2">
          <Link2Off size={17} className="text-faint" />
          <span className="text-sm font-semibold text-ink">Broker</span>
          <span className="badge" style={{ background: "#1A211D", color: "#9FB0A6" }}>Not connected</span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-mut">
          Connect <span className="text-ink">your own</span> Alpaca account to place real orders from Copilot.
          Start with paper keys — they trade fake money against real market data.
          Create them at alpaca.markets → Paper Trading → API Keys.
        </p>

        <div className="mt-4 grid gap-3 sm:max-w-md">
          <label className="field-label">API key ID
            <input className="field mt-1.5 font-mono text-xs" value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="PK…" />
          </label>
          <label className="field-label">API secret
            <input className="field mt-1.5 font-mono text-xs" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" className="btn text-xs" onClick={() => setMode("paper")} style={mode === "paper" ? { borderColor: "#B4F03C", color: "#B4F03C" } : {}}>Paper</button>
            <button
              type="button"
              className="btn text-xs"
              disabled={!status.liveAllowed}
              onClick={() => setMode("live")}
              style={mode === "live" ? { borderColor: "#F4645C", color: "#F4645C" } : {}}
              title={status.liveAllowed ? "" : "Live trading is disabled on this deployment"}
            >
              Live {status.liveAllowed ? "" : "(disabled)"}
            </button>
          </div>
          <button type="button" className="btn-primary" onClick={() => void connect()} disabled={busy || !keyId || !secret}>
            <Link2 size={14} /> {busy ? "Verifying…" : "Connect and verify"}
          </button>
          <p className="text-[11px] leading-relaxed text-faint">
            Keys are verified against the broker before being saved, then stored encrypted. They never reach your browser again.
            Axiom cannot withdraw funds — the API keys grant trading only.
          </p>
        </div>
      </div>
    );
  }

  const live = status.mode === "live";
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <Link2 size={17} style={{ color: live ? "#F4645C" : "#34D399" }} />
        <span className="text-sm font-semibold text-ink">Alpaca</span>
        <span className="badge" style={live ? { background: "#241111", color: "#F4645C" } : { background: "#10241C", color: "#34D399" }}>
          {live ? "LIVE — real money" : "Paper"}
        </span>
        {status.keyHint && <span className="font-mono text-xs text-faint">…{status.keyHint}</span>}
      </div>

      {status.error ? (
        <p className="mt-3 rounded-[14px] bg-[#241111] px-4 py-3 text-sm text-[#F4645C]">{status.error}</p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Equity", `$${Math.round(status.account?.equity ?? 0).toLocaleString()}`],
              ["Buying power", `$${Math.round(status.account?.buyingPower ?? 0).toLocaleString()}`],
              ["Orders today", `${status.ordersToday ?? 0} / 5`],
              ["Market", status.clock?.isOpen ? "Open" : "Closed"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-[14px] bg-panel2 p-3">
                <div className="eyebrow">{l}</div>
                <div className="mt-0.5 font-display text-lg font-semibold text-ink">{v}</div>
              </div>
            ))}
          </div>

          {status.account?.restricted && (
            <p className="mt-3 flex items-start gap-2 rounded-[14px] bg-[#241C0E] px-4 py-3 text-sm" style={{ color: "#F0B429" }}>
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              Your broker has restricted this account. Axiom will refuse to submit orders until that clears.
            </p>
          )}

          {status.positions && status.positions.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow mb-2">Positions at the broker</div>
              <ul className="grid gap-1.5">
                {status.positions.map((p) => (
                  <li key={p.symbol} className="flex items-baseline justify-between border-b border-line pb-1.5 font-mono text-xs last:border-0">
                    <span className="text-ink">{p.symbol} × {p.qty}</span>
                    <span className="text-mut">avg {p.avgEntryPrice}{p.unrealizedPl != null && <span style={{ color: p.unrealizedPl >= 0 ? "#34D399" : "#F4645C" }}> · {p.unrealizedPl >= 0 ? "+" : ""}{p.unrealizedPl.toFixed(2)}</span>}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn" onClick={() => void sync()} disabled={busy}>
          <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Sync orders
        </button>
        <button type="button" className="btn-danger" onClick={() => void disconnect()}>Disconnect</button>
      </div>
    </div>
  );
}
