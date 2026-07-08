"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

export default function ResetPage() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, recoveryCode: code, newPassphrase: next }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Reset failed."); setBusy(false); return; }
      setFresh(j.recoveryCode ?? ""); setBusy(false);
    } catch { setError("Couldn't reach the server."); setBusy(false); }
  };

  if (fresh) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="panel w-full max-w-md p-8 text-center">
          <div className="eyebrow text-[#B4F03C]">Passphrase changed</div>
          <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Save your new recovery code</h1>
          <p className="mt-3 text-sm leading-relaxed text-mut">The old code is now invalid. This new one is shown once.</p>
          <div className="mt-5 rounded-[14px] border border-[#27312B] bg-[#1A211D] px-4 py-4 font-mono text-lg tracking-wider text-[#B4F03C]">{fresh}</div>
          <button type="button" className="btn mt-3 w-full" onClick={() => { void navigator.clipboard?.writeText(fresh).catch(() => {}); }}>Copy code</button>
          <Link href="/login" className="btn-primary mt-3 w-full">Sign in with the new passphrase</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-8">
        <div className="eyebrow">Account recovery</div>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Reset your passphrase</h1>
        <p className="mt-3 text-sm leading-relaxed text-mut">
          Enter the recovery code you saved when you created the account (looks like <span className="font-mono text-ink">AXR-XXXX-XXXX</span>).
          No code? There's no other reset — your synced data can't be recovered, but you can create a fresh account.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="mt-6 space-y-4">
          <label className="field-label">Username<input className="field mt-1.5" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
          <label className="field-label">Recovery code<input className="field mt-1.5 font-mono" placeholder="AXR-XXXX-XXXX" value={code} onChange={(e) => setCode(e.target.value)} /></label>
          <label className="field-label">New passphrase · 8+ characters<input className="field mt-1.5" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
          {error && <p className="rounded-[14px] bg-[#241111] px-4 py-3 text-sm text-[#F4645C]">{error}</p>}
          <button type="submit" className="btn-primary w-full" disabled={busy}>{busy ? "Resetting…" : "Reset passphrase"} {!busy && <ArrowRight size={15} />}</button>
        </form>
        <p className="mt-5 text-center text-sm text-faint"><Link href="/login" className="quiet-link">Back to sign in</Link></p>
      </div>
    </div>
  );
}
