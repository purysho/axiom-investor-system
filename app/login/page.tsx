"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Leaf, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, passphrase }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Sign-in failed."); setBusy(false); return; }
      window.location.href = "/";
    } catch { setError("Couldn't reach the server."); setBusy(false); }
  };

  const goOffline = () => {
    document.cookie = "axiom_offline=1; path=/; max-age=31536000; samesite=lax";
    window.location.href = "/";
  };

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:flex lg:items-stretch lg:p-5">
      <div className="mx-auto grid w-full max-w-[1180px] overflow-hidden rounded-[30px] border border-line bg-panel shadow-lg lg:grid-cols-[1.08fr_.92fr]">
        <section className="relative hidden min-h-[720px] overflow-hidden bg-[#24483B] p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-40 -top-32 h-[520px] w-[520px] rounded-full border border-white/10" />
          <div className="absolute -right-16 -top-12 h-[330px] w-[330px] rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[15px] bg-[#F3E6CF] text-ink"><Leaf size={20} /></span>
            <div><div className="font-display text-3xl font-semibold leading-none">Axiom</div><div className="mt-1 text-xs text-white/55">Investor workspace</div></div>
          </div>
          <div className="relative max-w-xl">
            <div className="text-xs font-semibold text-[#F0B429]">A cockpit, not a casino.</div>
            <h1 className="mt-4 font-display text-[3.65rem] font-medium leading-[1.02] tracking-[-0.045em] text-[#241C0E]">Know what deserves attention. Ignore the rest.</h1>
            <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-white/65">Axiom helps you check risk, review your portfolio, record decisions and improve the process—without turning investing into an endless feed.</p>
          </div>
          <div className="relative flex items-center gap-3 text-xs text-white/55"><ShieldCheck size={16} className="text-[#F0B429]" /> Risk first · candidates second · learning always</div>
        </section>

        <section className="flex min-h-[680px] items-center justify-center p-6 sm:p-10 lg:min-h-[720px] lg:p-14">
          <div className="w-full max-w-[390px]">
            <div className="mb-9 flex items-center gap-3 lg:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#B4F03C] text-[#0B0F0D]"><Leaf size={18} strokeWidth={2.2} /></span>
              <div className="font-display text-2xl font-semibold text-ink">Axiom</div>
            </div>
            <div className="eyebrow">Welcome back</div>
            <h2 className="mt-2 font-display text-[2.45rem] font-semibold leading-tight tracking-[-0.04em] text-ink">Return to your process.</h2>
            <p className="mt-3 text-sm leading-relaxed text-mut">Sign in to continue your reviews and synced journal.</p>

            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-8 space-y-4">
              <label className="field-label">Username<input className="field mt-1.5" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
              <label className="field-label">Passphrase<input className="field mt-1.5" type="password" autoComplete="current-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></label>
              {error && <p className="rounded-[14px] bg-[#241111] px-4 py-3 text-sm text-[#F4645C]">{error}</p>}
              <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"} {!busy && <ArrowRight size={15} />}</button>
            </form>

            <p className="mt-3 text-center"><a href="/reset" className="quiet-link text-xs">Forgot passphrase? Use your recovery code</a></p>
            <p className="mt-5 text-center text-sm text-faint">New here? <Link href="/join" className="font-semibold text-[#B4F03C] hover:underline">Create your account</Link></p>
            <div className="mt-8 border-t border-line pt-6 text-center">
              <p className="text-xs leading-relaxed text-faint">Prefer to keep everything on this device?</p>
              <button onClick={goOffline} className="btn-ghost mt-2">Continue offline <ArrowRight size={14} /></button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
