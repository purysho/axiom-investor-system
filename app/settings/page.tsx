"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Check, ChevronDown, Download, HardDrive, KeyRound, RotateCcw,
  ShieldCheck, Sparkles, Upload, UserRound,
} from "lucide-react";
import { toast } from "@/components/toast";
import { SecurityPanel } from "@/components/security-panel";
import { fmtUsd } from "@/components/chrome";
import { demoState, exportBackup, importBackup } from "@/lib/backup";
import { downloadText } from "@/lib/csv";
import { replaceState, resetState, update, useAppState } from "@/lib/store";

export default function SettingsPage() {
  const state = useAppState();
  const s = state.settings;
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setSetting = (patch: Partial<typeof s>) => update((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  const num = (v: string, fallback: number) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
  const counts = { trades: state.trades.length, holdings: state.holdings.length, watch: state.watchRules.length, months: state.monthly.length, days: Object.keys(state.dailyChecks).length };
  const hasData = counts.trades + counts.holdings + counts.watch + counts.months + counts.days > 0;
  const oneR = (s.portfolioValue * s.riskPerTradePct) / 100;

  const doExport = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`axiom-backup-${stamp}.json`, exportBackup(state));
    toast("Backup downloaded.");
  };
  const onImport = async (file: File) => {
    const restored = importBackup(await file.text());
    if (!restored) { toast("File not recognised — no changes made.", "error"); return; }
    replaceState(restored);
    toast("Backup restored.");
  };
  const loadDemo = () => { replaceState(demoState()); toast("Example data loaded."); };
  const doReset = () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    resetState(); setConfirmReset(false); toast("All data cleared.");
  };

  return (
    <div>
      <section className="mb-10 rounded-[26px] bg-[#141B17] p-6 sm:p-9">
        <ShieldCheck size={25} className="text-[#456555]" />
        <h2 className="mt-5 max-w-3xl font-display text-[2.35rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[3.4rem]">Set the few rules AXIOM needs to guide you.</h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">You can start with the defaults. The important thing is to use one consistent set of limits instead of changing risk because a trade feels exciting.</p>
      </section>

      <section className="mb-12">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="page-kicker">Step 1</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Tell AXIOM what portfolio it is protecting</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">The portfolio value is used to turn percentages into dollar risk. The benchmark gives your long-term results a sensible comparison point.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="field-label">Approximate portfolio value ($)<input className="field mt-1.5" inputMode="decimal" value={s.portfolioValue} onChange={(e) => setSetting({ portfolioValue: num(e.target.value, s.portfolioValue) })} /></label>
            <label className="field-label">Long-term benchmark<input className="field mt-1.5" value={s.benchmarkName} onChange={(e) => setSetting({ benchmarkName: e.target.value })} placeholder="e.g. S&P 500" /></label>
            <label className="field-label sm:col-span-2">Market-data symbol for that benchmark <span className="font-normal text-faint">(advanced, usually leave the default)</span><input className="field mt-1.5" value={s.benchmarkSymbol} onChange={(e) => setSetting({ benchmarkSymbol: e.target.value })} placeholder="e.g. spy.us" /></label>
          </div>
        </div>
      </section>

      <section className="mb-12 border-t border-[#27312B] pt-10">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="page-kicker">Step 2</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Choose the planned risk for one swing trade</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">AXIOM calls this 1R. It is the dollar loss you plan around if the initial stop is reached. It is not a guaranteed maximum loss.</p>
          </div>
          <div>
            <label className="field-label max-w-sm">Risk per trade (%)<input className="field mt-1.5" inputMode="decimal" value={s.riskPerTradePct} onChange={(e) => setSetting({ riskPerTradePct: num(e.target.value, s.riskPerTradePct) })} /></label>
            <div className="mt-5 rounded-[20px] bg-[#151B17] p-5">
              <div className="text-sm font-semibold text-[#9FB0A6]">With your current portfolio value</div>
              <div className="mt-2 font-display text-[2.5rem] font-semibold tracking-[-0.04em]">1R = {fmtUsd(oneR)}</div>
              <p className="mt-2 text-sm leading-relaxed text-mut">A trade with an initial stop should be sized so the planned stop loss is around this amount before the single-position cap is applied.</p>
              <Link href="/gate" className="quiet-link mt-4">Try the position-size calculator <ArrowRight size={14} /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-12 border-t border-[#27312B] pt-10">
        <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="page-kicker">Step 3</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Put a ceiling on concentration</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">These caps stop a strong opinion from quietly turning into one oversized position or too much total swing exposure.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="field-label">Maximum single position (% of portfolio)<input className="field mt-1.5" inputMode="decimal" value={s.notionalCapPct} onChange={(e) => setSetting({ notionalCapPct: num(e.target.value, s.notionalCapPct) })} /></label>
            <label className="field-label">Maximum total swing heat (% of portfolio)<input className="field mt-1.5" inputMode="decimal" value={s.heatCapPct} onChange={(e) => setSetting({ heatCapPct: num(e.target.value, s.heatCapPct) })} /></label>
            <p className="sm:col-span-2 text-sm leading-relaxed text-mut">The stricter daily risk-permission threshold is managed on the <Link href="/gate" className="quiet-link">risk check</Link>, next to the conditions it governs. Review limits monthly rather than during a trade.</p>
          </div>
        </div>
      </section>

      <section className="mb-12 rounded-[24px] bg-[#241C0E]/76 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <Check size={21} className="mt-1 shrink-0 text-[#49695a]" />
          <div>
            <div className="font-semibold">Your current starting rules</div>
            <p className="mt-2 max-w-3xl text-[16px] leading-relaxed text-mut">AXIOM is protecting a portfolio of about <strong className="text-ink">{fmtUsd(s.portfolioValue)}</strong>. One planned trade risk is <strong className="text-ink">{s.riskPerTradePct}% ({fmtUsd(oneR)})</strong>. A single position is capped at <strong className="text-ink">{s.notionalCapPct}%</strong>, and total swing heat is capped at <strong className="text-ink">{s.heatCapPct}%</strong>. Your long-term comparison is <strong className="text-ink">{s.benchmarkName}</strong>.</p>
            <Link href="/" className="btn-primary mt-6">Go to Today <ArrowRight size={15} /></Link>
          </div>
        </div>
      </section>

      <section className="border-t border-[#27312B] pt-10">
        <div className="page-kicker">Account and data</div>
        <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">The practical stuff</h2>
        <p className="mt-2 max-w-2xl text-sm text-mut">Account, backup and test-data controls live here so they do not interrupt the investing routine.</p>

        <div className="mt-7 divide-y divide-[#27312B] border-y border-[#27312B]">
          <AccountPanel />

          <details className="group">
            <summary className="grid cursor-pointer list-none gap-4 py-6 sm:grid-cols-[44px_1fr_auto] sm:items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#151B17] text-[#49695a]"><HardDrive size={18} /></span>
              <div><div className="text-[17px] font-semibold">Backup and restore</div><p className="mt-1 text-sm text-mut">Keep a portable copy of your holdings, journal, reviews and settings.</p></div>
              <ChevronDown size={18} className="text-faint transition-transform group-open:rotate-180" />
            </summary>
            <div className="mb-6 rounded-[20px] bg-[#241C0E]/76 p-5 sm:ml-14 sm:p-7">
              <p className="text-sm leading-relaxed text-mut">Your backup contains {counts.holdings} holding{counts.holdings === 1 ? "" : "s"}, {counts.trades} trade{counts.trades === 1 ? "" : "s"}, {counts.watch} idea rule{counts.watch === 1 ? "" : "s"}, {counts.days} daily check{counts.days === 1 ? "" : "s"}, and {counts.months} monthly review{counts.months === 1 ? "" : "s"}.</p>
              <div className="mt-5 flex flex-wrap gap-3"><button type="button" className="btn" onClick={doExport}><Download size={15} />Download backup</button><button type="button" className="btn" onClick={() => fileRef.current?.click()}><Upload size={15} />Restore backup</button><input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = ""; }} /></div>
            </div>
          </details>

          <details className="group">
            <summary className="grid cursor-pointer list-none gap-4 py-6 sm:grid-cols-[44px_1fr_auto] sm:items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#151B17] text-[#a16b4c]"><Sparkles size={18} /></span>
              <div><div className="text-[17px] font-semibold">Example data</div><p className="mt-1 text-sm text-mut">See the full site filled with a realistic sample before entering your own information.</p></div>
              <ChevronDown size={18} className="text-faint transition-transform group-open:rotate-180" />
            </summary>
            <div className="mb-6 rounded-[20px] bg-[#241C0E]/76 p-5 sm:ml-14 sm:p-7"><p className="text-sm leading-relaxed text-mut">Loading example data replaces the current local state with sample holdings, swing trades, trade ideas, daily checks and monthly reviews.</p><button type="button" className="btn mt-5" onClick={loadDemo}>Load example data</button></div>
          </details>

          <details className="group">
            <summary className="grid cursor-pointer list-none gap-4 py-6 sm:grid-cols-[44px_1fr_auto] sm:items-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#241111] text-[#F4645C]"><RotateCcw size={18} /></span>
              <div><div className="text-[17px] font-semibold">Reset AXIOM</div><p className="mt-1 text-sm text-mut">Clear all holdings, trades, ideas, daily checks and monthly reviews from this browser.</p></div>
              <ChevronDown size={18} className="text-faint transition-transform group-open:rotate-180" />
            </summary>
            <div className="mb-6 rounded-[20px] bg-[#241111] p-5 sm:ml-14 sm:p-7"><p className="text-sm leading-relaxed text-mut">Download a backup first if there is any chance you will want the data again.</p><div className="mt-5 flex flex-wrap items-center gap-3"><button type="button" className="btn-danger" onClick={doReset} disabled={!hasData && !confirmReset}>{confirmReset ? "Click again to erase everything" : "Reset all data"}</button>{confirmReset && <button type="button" className="btn" onClick={() => setConfirmReset(false)}>Cancel</button>}</div></div>
          </details>
        </div>
      </section>
    </div>
  );
}

function AccountPanel() {
  const [newCode, setNewCode] = useState("");
  const [delPass, setDelPass] = useState("");
  const [delOpen, setDelOpen] = useState(false);

  const regenCode = async () => {
    const res = await fetch("/api/account/recovery", { method: "POST" });
    const j = await res.json();
    if (res.ok) { setNewCode(j.recoveryCode); toast("New recovery code generated — save it now."); }
    else toast(j.error ?? "Couldn't generate a code.", "error");
  };

  const deleteAccount = async () => {
    const res = await fetch("/api/account/delete", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passphrase: delPass }),
    });
    const j = await res.json();
    if (res.ok) { window.location.href = "/login"; }
    else toast(j.error ?? "Couldn't delete the account.", "error");
  };

  const [account, setAccount] = useState<{ username: string; displayName: string; mfaEnabled?: boolean } | null>(null);
  const [offline, setOffline] = useState(false);
  const [dn, setDn] = useState("");
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/account");
        if (res.status === 401) { setOffline(true); return; }
        if (!res.ok) throw new Error();
        const j = await res.json();
        setAccount({ username: j.username, displayName: j.displayName });
        setDn(j.displayName);
      } catch { setOffline(true); }
    })();
  }, []);

  const saveName = async () => {
    setMsg("");
    const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: dn }) }).catch(() => null);
    setMsg(res?.ok ? "Display name saved." : "Could not save the display name.");
  };
  const changePass = async () => {
    setMsg("");
    const res = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, next }) }).catch(() => null);
    if (res?.ok) { setCur(""); setNext(""); setMsg("Passphrase changed."); }
    else { const j = res ? await res.json().catch(() => null) : null; setMsg(j?.error ?? "Could not change the passphrase."); }
  };
  const signOut = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); window.location.href = "/login"; };

  return (
    <details className="group">
      <summary className="grid cursor-pointer list-none gap-4 py-6 sm:grid-cols-[44px_1fr_auto] sm:items-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#151B17] text-[#49695a]">{offline ? <UserRound size={18} /> : <KeyRound size={18} />}</span>
        <div><div className="text-[17px] font-semibold">Account and sync</div><p className="mt-1 text-sm text-mut">{offline ? "This browser is currently keeping the AXIOM data locally." : account ? `Signed in as ${account.username}.` : "Checking account status…"}</p></div>
        <ChevronDown size={18} className="text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="mb-6 rounded-[20px] bg-[#241C0E]/76 p-5 sm:ml-14 sm:p-7">
        {offline ? <p className="text-sm leading-relaxed text-mut">You are using offline mode. Data stays in this browser and does not sync across devices. <a href="/login" className="quiet-link">Sign in or join with an invite</a> to enable account sync.</p> : account ? <div className="grid gap-5"><div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="field-label">Display name<input className="field mt-1.5" value={dn} onChange={(e) => setDn(e.target.value)} /></label><button type="button" className="btn" onClick={() => void saveName()}>Save name</button></div><div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Current passphrase<input className="field mt-1.5" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label><label className="field-label">New passphrase<input className="field mt-1.5" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label></div><div className="flex flex-wrap gap-3"><button type="button" className="btn" onClick={() => void changePass()}>Change passphrase</button><button type="button" className="btn" onClick={() => void signOut()}>Sign out</button></div>{msg && <p className="text-sm text-mut" role="status">{msg}</p>}

<div className="border-t border-line pt-5">
  <div className="text-sm font-semibold text-ink">Recovery code</div>
  <p className="mt-1 text-sm leading-relaxed text-mut">The only way to reset a forgotten passphrase. Generating a new one invalidates the old.</p>
  <button type="button" className="btn mt-3" onClick={() => void regenCode()}>Generate a new recovery code</button>
  {newCode && <div className="mt-3 rounded-[14px] border border-[#27312B] bg-[#1A211D] px-4 py-3 font-mono text-base tracking-wider text-[#B4F03C]">{newCode}</div>}
</div>

<div className="border-t border-line pt-5">
  <SecurityPanel mfaOn={Boolean(account.mfaEnabled)} />
</div>

<div className="border-t border-line pt-5">
  <div className="text-sm font-semibold text-[#F4645C]">Delete this account</div>
  <p className="mt-1 text-sm leading-relaxed text-mut">Removes your account and all synced data, permanently. Export a backup first if you want to keep it.</p>
  {!delOpen ? (
    <button type="button" className="btn-danger mt-3" onClick={() => setDelOpen(true)}>Delete account…</button>
  ) : (
    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <label className="field-label">Confirm your passphrase<input className="field mt-1.5" type="password" value={delPass} onChange={(e) => setDelPass(e.target.value)} /></label>
      <div className="flex gap-2"><button type="button" className="btn-danger" onClick={() => void deleteAccount()}>Delete permanently</button><button type="button" className="btn" onClick={() => { setDelOpen(false); setDelPass(""); }}>Cancel</button></div>
    </div>
  )}
</div>
</div> : <p className="text-sm text-mut">Checking your account…</p>}
      </div>
    </details>
  );
}
