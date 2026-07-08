"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Leaf, LockKeyhole } from "lucide-react";

export default function JoinPage() {
  const [invite, setInvite] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [signupsOpen, setSignupsOpen] = useState(true);
  const [recovery, setRecovery] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/config").then((r) => r.json()).then((j) => setSignupsOpen(Boolean(j.signupsOpen))).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invite, username, displayName, passphrase }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't create the account."); setBusy(false); return; }
      setRecovery(j.recoveryCode ?? ""); setBusy(false);
    } catch { setError("Couldn't reach the server."); setBusy(false); }
  };

  if (recovery) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel w-full max-w-md p-8 text-center">
          <div className="eyebrow text-[#B4F03C]">Account created</div>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Save your recovery code</h1>
          <p className="mt-3 text-sm leading-relaxed text-mut">This is the only way to reset a forgotten passphrase. It's shown once — store it somewhere safe.</p>
          <div className="mt-5 rounded-[14px] border border-[#27312B] bg-[#1A211D] px-4 py-4 font-mono text-lg tracking-wider text-[#B4F03C]">{recovery}</div>
          <button type="button" className="btn mt-3 w-full" onClick={() => { void navigator.clipboard?.writeText(recovery).catch(() => {}); }}>Copy code</button>
          <a href="/settings" className="btn-primary mt-3 w-full">I've saved it — set up my rules</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8 sm:px-6 lg:flex lg:items-stretch lg:p-5">
      <div className="mx-auto grid w-full max-w-[1180px] overflow-hidden rounded-[30px] border border-line bg-panel shadow-lg lg:grid-cols-[.92fr_1.08fr]">
        <section className="flex min-h-[760px] items-center justify-center p-6 sm:p-10 lg:p-14">
          <div className="w-full max-w-[420px]">
            <div className="mb-8 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#24483B] text-[#F3E6CF]"><Leaf size={18} /></span><div className="font-display text-2xl font-semibold text-ink">Axiom</div></div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(180,240,60,0.12)] px-3 py-1.5 text-[#B4F03C] text-xs font-bold text-[#B4F03C]"><LockKeyhole size={13} /> Invite only</div>
            <h1 className="mt-5 font-display text-[2.5rem] font-semibold leading-tight tracking-[-0.04em] text-ink">Create your workspace.</h1>
            <p className="mt-3 text-sm leading-relaxed text-mut">Your journal, rules and reviews can sync across devices once your account is created.</p>

            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-7 space-y-4">
              {!signupsOpen && (<label className="field-label">Invite code<input className="field mt-1.5 font-mono" value={invite} placeholder="AXIOM-XXXXXXXX" onChange={(e) => setInvite(e.target.value)} /></label>)}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="field-label">Username<input className="field mt-1.5" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
                <label className="field-label">Display name<input className="field mt-1.5" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
              </div>
              <label className="field-label">Passphrase <span className="font-normal text-faint">· 8+ characters</span><input className="field mt-1.5" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} /></label>
              {error && <p className="rounded-[14px] bg-[#241111] px-4 py-3 text-sm text-[#F4645C]">{error}</p>}
              <p className="text-[11px] leading-relaxed text-faint">By creating an account you agree to the <a href="/terms" className="underline">Terms</a> and <a href="/privacy" className="underline">Privacy note</a>. AXIOM is an educational tool, not investment advice.</p>
              <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Creating…" : "Create account"} {!busy && <ArrowRight size={15} />}</button>
            </form>
            <p className="mt-5 text-center text-sm text-faint">Already have an account? <Link href="/login" className="font-semibold text-[#B4F03C] hover:underline">Sign in</Link></p>
          </div>
        </section>

        <section className="relative hidden min-h-[760px] overflow-hidden bg-[#1E3A30] p-12 lg:flex lg:flex-col lg:justify-end">
          <div className="absolute -right-36 -top-28 h-[500px] w-[500px] rounded-full border border-white/10" />
          <div className="absolute right-16 top-16 h-52 w-52 rounded-full bg-[#B4F03C]/15 blur-3xl" />
          <div className="relative max-w-xl rounded-[26px] border border-white/10 bg-white/[0.06] p-7 shadow-card backdrop-blur-sm">
            <div className="eyebrow text-[#8FBCA4]">The Axiom promise</div>
            <p className="mt-4 font-display text-[2.35rem] font-medium leading-[1.15] tracking-[-0.035em] text-[#EAF4EC]">Easy to follow the process. Deliberate to violate it.</p>
            <p className="mt-5 text-sm leading-relaxed text-[#B9C9BE]">Axiom is designed to make reviews, notes and reflection effortless—while adding a little healthy friction before consequential risk decisions.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
