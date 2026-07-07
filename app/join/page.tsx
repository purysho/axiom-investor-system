"use client";

import Link from "next/link";
import { useState } from "react";

export default function JoinPage() {
  const [invite, setInvite] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite, username, displayName, passphrase }),
      });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "Couldn't create the account."); setBusy(false); return; }
      window.location.href = "/";
    } catch { setError("Couldn't reach the server."); setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-ink mb-1">Axiom</div>
          <div className="text-sm text-faint">Investor System</div>
        </div>

        <div className="panel p-6">
          <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold mb-4"
               style={{ background: "#EDF4FF", color: "#3B6CB0" }}>
            Invite only
          </div>
          <h1 className="text-lg font-semibold text-ink mb-5">Create your account</h1>
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
            <div>
              <label className="field-label">Invite code</label>
              <input className="field font-mono" value={invite} placeholder="AXIOM-XXXXXXXX"
                onChange={(e) => setInvite(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Username</label>
              <input className="field" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Display name <span className="font-normal text-faint">(shown to the group)</span></label>
              <input className="field" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Passphrase <span className="font-normal text-faint">(8+ characters)</span></label>
              <input className="field" type="password" autoComplete="new-password"
                value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </div>
            {error && (
              <p className="text-sm rounded-lg px-3 py-2" style={{ background: "#FEF1F1", color: "#C0252A" }}>
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
          <p className="mt-4 text-sm text-center text-faint">
            Already have an account?{" "}
            <Link href="/login" className="text-mut font-medium hover:text-ink transition-colors">
              Sign in →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
