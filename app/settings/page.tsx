"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, Stat, fmtUsd } from "@/components/chrome";
import { demoState, exportBackup, importBackup } from "@/lib/backup";
import { downloadText } from "@/lib/csv";
import { replaceState, resetState, update, useAppState } from "@/lib/store";

export default function SettingsPage() {
  const state = useAppState();
  const s = state.settings;
  const [notice, setNotice] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setSetting = (patch: Partial<typeof s>) =>
    update((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const counts = {
    trades: state.trades.length,
    holdings: state.holdings.length,
    watch: state.watchRules.length,
    months: state.monthly.length,
    days: Object.keys(state.dailyChecks).length,
  };
  const hasData =
    counts.trades + counts.holdings + counts.watch + counts.months + counts.days > 0;

  const doExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`axiom-backup-${stamp}.json`, exportBackup(state));
    setNotice("Backup downloaded. Keep it somewhere safe — it's the only copy outside this browser.");
  };

  const onImport = async (file: File) => {
    const restored = importBackup(await file.text());
    if (!restored) {
      setNotice("That file isn't a recognizable Axiom backup. No changes made.");
      return;
    }
    replaceState(restored);
    setNotice("Backup restored. Everything on every page now reflects the imported data.");
  };

  const loadDemo = () => {
    replaceState(demoState());
    setNotice("Demo data loaded. Explore every page, then reset when you're ready to start clean.");
  };

  const doReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetState();
    setConfirmReset(false);
    setNotice("All data cleared. This browser is back to a clean slate.");
  };

  return (
    <div className="grid gap-3">
      <Panel eyebrow="One place for the numbers every surface reads from" title="Profile">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="grid gap-1 text-xs text-mut">
            Portfolio value ($)
            <input className="field" inputMode="decimal" value={s.portfolioValue} onChange={(e) => setSetting({ portfolioValue: num(e.target.value, s.portfolioValue) })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Benchmark name
            <input className="field" value={s.benchmarkName} onChange={(e) => setSetting({ benchmarkName: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Benchmark symbol (Stooq, e.g. spy.us)
            <input className="field" value={s.benchmarkSymbol} onChange={(e) => setSetting({ benchmarkSymbol: e.target.value })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Risk per trade (%)
            <input className="field" inputMode="decimal" value={s.riskPerTradePct} onChange={(e) => setSetting({ riskPerTradePct: num(e.target.value, s.riskPerTradePct) })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Single-name cap (%)
            <input className="field" inputMode="decimal" value={s.notionalCapPct} onChange={(e) => setSetting({ notionalCapPct: num(e.target.value, s.notionalCapPct) })} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Portfolio heat cap (%)
            <input className="field" inputMode="decimal" value={s.heatCapPct} onChange={(e) => setSetting({ heatCapPct: num(e.target.value, s.heatCapPct) })} />
          </label>
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Gate thresholds live on the <a className="underline decoration-line hover:decoration-[var(--gate)]" href="/gate">risk gate</a> page,
          next to the checks they govern. Review them monthly, never intraday.
        </p>
      </Panel>

      <AccountPanel />

      <Panel eyebrow="Belt and braces, even with sync on" title="Backup & restore">
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Stat label="Trades" value={String(counts.trades)} />
          <Stat label="Holdings" value={String(counts.holdings)} />
          <Stat label="Watch rules" value={String(counts.watch)} />
          <Stat label="Months" value={String(counts.months)} />
          <Stat label="Daily checks" value={String(counts.days)} />
        </div>
        <p className="mb-2 text-xs leading-relaxed text-mut">
          Signed-in accounts sync automatically across devices; offline mode keeps everything in this browser
          only. Either way, export a backup regularly — the file is portable JSON you can restore anywhere this
          app runs, and it&apos;s your recovery path if a device or the server is ever lost.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-gate" onClick={doExport}>
            Export backup (.json)
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Restore from backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2">
        <Panel eyebrow="See it populated" title="Demo data">
          <p className="text-xs leading-relaxed text-mut">
            Load a realistic sample — five swings including a rule-violation and tagged leaks, a five-sleeve
            portfolio, a watchlist, and two closed months — so you can walk every page before entering your own.
            Loading demo data replaces whatever is here now.
          </p>
          <button type="button" className="btn mt-2" onClick={loadDemo}>
            Load demo data
          </button>
        </Panel>

        <Panel eyebrow="Start clean" title="Reset">
          <p className="text-xs leading-relaxed text-mut">
            Permanently clears every trade, holding, watch rule, daily check, and month in this browser. Export a
            backup first if there&apos;s any chance you&apos;ll want it back.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              className="border px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors"
              style={{ borderColor: "#E5484D", color: "#E5484D", background: confirmReset ? "color-mix(in srgb, #E5484D 12%, transparent)" : undefined }}
              onClick={doReset}
              disabled={!hasData && !confirmReset}
            >
              {confirmReset ? "Click again to confirm" : "Reset all data"}
            </button>
            {confirmReset && (
              <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            )}
          </div>
        </Panel>
      </div>

      {notice && (
        <p className="font-mono text-[11px] text-mut" role="status" aria-live="polite">
          {notice}
        </p>
      )}

      <Panel eyebrow="Reference" title="Current profile at a glance">
        <p className="font-mono text-xs text-mut">
          {fmtUsd(s.portfolioValue)} · {s.riskPerTradePct}% risk/trade ({fmtUsd((s.portfolioValue * s.riskPerTradePct) / 100)} = 1R) ·
          single-name cap {s.notionalCapPct}% · heat cap {s.heatCapPct}% · benchmark {s.benchmarkName} ({s.benchmarkSymbol})
        </p>
      </Panel>
    </div>
  );
}

function AccountPanel() {
  const [account, setAccount] = useState<{ username: string; displayName: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const [dn, setDn] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/account");
        if (res.status === 401) {
          setOffline(true);
          return;
        }
        if (!res.ok) throw new Error();
        const j = await res.json();
        setAccount({ username: j.username, displayName: j.displayName });
        setDn(j.displayName);
      } catch {
        setOffline(true);
      }
    })();
  }, []);

  const saveName = async () => {
    setMsg("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: dn }),
    }).catch(() => null);
    setMsg(res?.ok ? "Display name saved." : "Couldn't save the display name.");
  };

  const changePass = async () => {
    setMsg("");
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current: cur, next }),
    }).catch(() => null);
    if (res?.ok) {
      setCur("");
      setNext("");
      setMsg("Passphrase changed.");
    } else {
      const j = res ? await res.json().catch(() => null) : null;
      setMsg(j?.error ?? "Couldn't change the passphrase.");
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };

  if (offline) {
    return (
      <Panel eyebrow="Offline mode" title="Account">
        <p className="text-xs leading-relaxed text-mut">
          You&apos;re running without an account — everything stays in this browser, and there&apos;s no cross-device
          sync or group view.{" "}
          <a href="/login" className="underline decoration-line hover:decoration-[var(--gate)]">
            Sign in or join with an invite
          </a>{" "}
          to turn those on. Your local data will be adopted by the account on first sign-in.
        </p>
      </Panel>
    );
  }

  return (
    <Panel eyebrow={account ? `signed in as ${account.username}` : "loading…"} title="Account & sync">
      {account && (
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-mut sm:col-span-2">
              Display name (shown to the group)
              <input className="field" value={dn} onChange={(e) => setDn(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button type="button" className="btn" onClick={() => void saveName()}>
                Save name
              </button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-mut">
              Current passphrase
              <input className="field" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs text-mut">
              New passphrase (8+ chars)
              <input className="field" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </label>
            <div className="flex items-end">
              <button type="button" className="btn" onClick={() => void changePass()}>
                Change passphrase
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn" onClick={() => void signOut()}>
              Sign out
            </button>
            <span className="text-[11px] text-faint">
              Signing out keeps this browser&apos;s local copy; it simply stops syncing until you sign back in.
            </span>
          </div>
          {msg && <p className="font-mono text-[11px] text-mut" role="status">{msg}</p>}
        </div>
      )}
    </Panel>
  );
}
