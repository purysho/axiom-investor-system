"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, passphrase }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Sign-in failed.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  };

  const goOffline = () => {
    document.cookie = "axiom_offline=1; path=/; max-age=31536000; samesite=lax";
    window.location.href = "/";
  };

  return (
    <div className="mx-auto grid w-full max-w-sm gap-3">
      <section className="panel border-l-4 p-4" style={{ borderLeftColor: "var(--gate)" }}>
        <div className="eyebrow">Axiom Investor System</div>
        <h1 className="mt-1 font-mono text-base text-ink">Sign in</h1>
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1 text-xs text-mut">
            Username
            <input className="field" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Passphrase
            <input className="field" type="password" autoComplete="current-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
          {error && <p className="font-mono text-[11px]" style={{ color: "#E5484D" }}>{error}</p>}
          <button type="submit" className="btn-gate" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-3 text-[11px] text-faint">
          Have an invite code?{" "}
          <Link href="/join" className="underline decoration-line hover:decoration-[var(--gate)]">
            Create your account
          </Link>
          .
        </p>
      </section>
      <section className="panel p-3">
        <p className="text-[11px] leading-relaxed text-faint">
          No account and no invite? You can still run the whole system in this browser only — nothing leaves
          this device, and there&apos;s no cross-device sync until you sign in.
        </p>
        <button type="button" className="btn mt-2" onClick={goOffline}>
          Continue offline
        </button>
      </section>
    </div>
  );
}
