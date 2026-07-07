"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, passphrase }),
      });
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
    <div className="min-h-screen bg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-3xl font-bold text-ink mb-1">Axiom</div>
          <div className="text-sm text-faint">Investor System</div>
        </div>

        {/* Card */}
        <div className="panel p-6">
          <h1 className="text-lg font-semibold text-ink mb-5">Welcome back</h1>
          <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="space-y-4">
            <div>
              <label className="field-label">Username</label>
              <input className="field" autoComplete="username" value={username}
                onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Passphrase</label>
              <input className="field" type="password" autoComplete="current-password"
                value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
            </div>
            {error && (
              <p className="text-sm rounded-lg px-3 py-2" style={{ background: "#FEF1F1", color: "#C0252A" }}>
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-4 text-sm text-center text-faint">
            Have an invite?{" "}
            <Link href="/join" className="text-mut font-medium hover:text-ink transition-colors">
              Create your account →
            </Link>
          </p>
        </div>

        {/* Offline option */}
        <div className="mt-4 p-4 rounded-xl border border-line bg-panel2 text-center">
          <p className="text-xs text-faint mb-3">No account? You can still use the full system — data stays in this browser only.</p>
          <button onClick={goOffline} className="btn text-xs px-4 py-2">
            Continue offline
          </button>
        </div>
      </div>
    </div>
  );
}
