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
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite, username, displayName, passphrase }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Couldn't create the account.");
        setBusy(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Couldn't reach the server.");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-sm gap-3">
      <section className="panel border-l-4 p-4" style={{ borderLeftColor: "var(--gate)" }}>
        <div className="eyebrow">Invite-only</div>
        <h1 className="mt-1 font-mono text-base text-ink">Create your account</h1>
        <form
          className="mt-3 grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="grid gap-1 text-xs text-mut">
            Invite code
            <input className="field" value={invite} placeholder="AXIOM-XXXXXXXX" onChange={(e) => setInvite(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Username (sign-in name)
            <input className="field" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Display name (shown to the group)
            <input className="field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-mut">
            Passphrase (8+ characters)
            <input className="field" type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          </label>
          {error && <p className="font-mono text-[11px]" style={{ color: "#E5484D" }}>{error}</p>}
          <button type="submit" className="btn-gate" disabled={busy}>
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-3 text-[11px] text-faint">
          Already have an account?{" "}
          <Link href="/login" className="underline decoration-line hover:decoration-[var(--gate)]">
            Sign in
          </Link>
          . There is no passphrase reset — write it down; existing members can always issue a fresh invite.
        </p>
      </section>
    </div>
  );
}
