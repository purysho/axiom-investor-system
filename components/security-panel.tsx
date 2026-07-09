"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { KeyRound, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "@/components/toast";

interface ActivityRow { event: string; detail: string; ip: string; createdAt: string }

const EVENT_LABELS: Record<string, string> = {
  "account.created": "Account created",
  "account.deleted": "Account deleted",
  "login.success": "Signed in",
  "login.failed": "Failed sign-in",
  "login.locked": "Account locked",
  logout: "Signed out",
  "logout.all": "Signed out everywhere",
  "passphrase.changed": "Passphrase changed",
  "passphrase.reset": "Passphrase reset",
  "recovery.regenerated": "Recovery code regenerated",
  "mfa.enabled": "Two-factor turned on",
  "mfa.disabled": "Two-factor turned off",
  "mfa.failed": "Failed two-factor code",
  "mfa.backup_used": "Backup code used",
};

export function SecurityPanel({ mfaOn }: { mfaOn: boolean }) {
  const [enabled, setEnabled] = useState(mfaOn);
  const [step, setStep] = useState<"idle" | "scan" | "codes">("idle");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [backups, setBackups] = useState<string[]>([]);
  const [offPass, setOffPass] = useState("");
  const [offOpen, setOffOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  useEffect(() => { setEnabled(mfaOn); }, [mfaOn]);
  useEffect(() => {
    void fetch("/api/account/activity").then((r) => (r.ok ? r.json() : { events: [] })).then((j) => setActivity(j.events ?? [])).catch(() => {});
  }, [enabled, step]);

  const startSetup = async () => {
    const res = await fetch("/api/account/mfa/setup", { method: "POST" });
    const j = await res.json();
    if (!res.ok) { toast(j.error ?? "Couldn't start setup.", "error"); return; }
    setQr(j.qrDataUrl); setSecret(j.secret); setStep("scan");
  };

  const confirmSetup = async () => {
    const res = await fetch("/api/account/mfa/enable", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }),
    });
    const j = await res.json();
    if (!res.ok) { toast(j.error ?? "Couldn't verify that code.", "error"); return; }
    setBackups(j.backupCodes ?? []); setEnabled(true); setStep("codes"); setCode("");
    toast("Two-factor is on.");
  };

  const disable = async () => {
    const res = await fetch("/api/account/mfa/disable", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passphrase: offPass }),
    });
    const j = await res.json();
    if (!res.ok) { toast(j.error ?? "Couldn't turn it off.", "error"); return; }
    setEnabled(false); setOffOpen(false); setOffPass(""); setStep("idle");
    toast("Two-factor turned off.", "warning");
  };

  const signOutEverywhere = async () => {
    const res = await fetch("/api/account/sessions", { method: "POST" });
    if (res.ok) window.location.href = "/login";
    else toast("Couldn't sign out other devices.", "error");
  };

  return (
    <div className="grid gap-6">
      {/* ── Two-factor ─────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2">
          {enabled ? <ShieldCheck size={17} style={{ color: "#34D399" }} /> : <ShieldOff size={17} className="text-faint" />}
          <span className="text-sm font-semibold text-ink">Two-factor authentication</span>
          <span className="badge" style={enabled ? { background: "#10241C", color: "#34D399" } : { background: "#1A211D", color: "#9FB0A6" }}>
            {enabled ? "On" : "Off"}
          </span>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-mut">
          A 6-digit code from your phone, on top of your passphrase. Works with any authenticator app.
        </p>

        {!enabled && step === "idle" && (
          <button type="button" className="btn mt-3" onClick={() => void startSetup()}>Turn on two-factor</button>
        )}

        {step === "scan" && (
          <div className="mt-4 rounded-[16px] border border-line bg-panel2 p-5">
            <p className="text-sm text-mut">Scan this with your authenticator app, then type the code it shows.</p>
            <div className="mt-4 flex flex-wrap items-start gap-5">
              {qr && <Image src={qr} alt="Two-factor QR code" width={180} height={180} className="rounded-[12px]" unoptimized />}
              <div className="grid gap-3">
                <div>
                  <div className="eyebrow">Or enter this key by hand</div>
                  <code className="mt-1 block break-all font-mono text-xs text-ink">{secret}</code>
                </div>
                <div className="flex gap-2">
                  <input className="field w-36 text-center font-mono tracking-widest" placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} />
                  <button type="button" className="btn-primary" onClick={() => void confirmSetup()} disabled={code.trim().length < 6}>Verify</button>
                </div>
                <button type="button" className="btn-ghost justify-start text-xs" onClick={() => setStep("idle")}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {step === "codes" && backups.length > 0 && (
          <div className="mt-4 rounded-[16px] border border-[#4A3A16] bg-[#241C0E] p-5">
            <div className="text-sm font-semibold" style={{ color: "#F0B429" }}>Save your backup codes</div>
            <p className="mt-1 text-sm leading-relaxed text-mut">Each works once, if you lose your phone. Shown only now.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-sm text-ink sm:grid-cols-4">
              {backups.map((b) => <span key={b} className="rounded bg-[#1A211D] px-2 py-1.5 text-center">{b}</span>)}
            </div>
            <div className="mt-3 flex gap-2">
              <button type="button" className="btn" onClick={() => { void navigator.clipboard?.writeText(backups.join("\n")).catch(() => {}); toast("Copied."); }}>Copy all</button>
              <button type="button" className="btn-primary" onClick={() => { setStep("idle"); setBackups([]); }}>I've saved them</button>
            </div>
          </div>
        )}

        {enabled && step === "idle" && (
          !offOpen ? (
            <button type="button" className="btn mt-3" onClick={() => setOffOpen(true)}>Turn off two-factor</button>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="field-label">Confirm your passphrase<input className="field mt-1.5 w-56" type="password" value={offPass} onChange={(e) => setOffPass(e.target.value)} /></label>
              <button type="button" className="btn-danger" onClick={() => void disable()}>Turn off</button>
              <button type="button" className="btn" onClick={() => { setOffOpen(false); setOffPass(""); }}>Cancel</button>
            </div>
          )
        )}
      </div>

      {/* ── Sessions ───────────────────────────────── */}
      <div className="border-t border-line pt-5">
        <div className="flex items-center gap-2"><LogOut size={16} className="text-faint" /><span className="text-sm font-semibold text-ink">Other devices</span></div>
        <p className="mt-1 text-sm leading-relaxed text-mut">Signs out every browser, including this one. Do this if you think someone else has access.</p>
        <button type="button" className="btn mt-3" onClick={() => void signOutEverywhere()}>Sign out everywhere</button>
      </div>

      {/* ── Activity ───────────────────────────────── */}
      <div className="border-t border-line pt-5">
        <div className="flex items-center gap-2"><KeyRound size={16} className="text-faint" /><span className="text-sm font-semibold text-ink">Recent security activity</span></div>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-faint">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-3 grid gap-1.5">
            {activity.map((a, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-1.5 text-xs last:border-0">
                <span className="font-medium text-ink">{EVENT_LABELS[a.event] ?? a.event}{a.detail && <span className="ml-1.5 font-normal text-faint">({a.detail})</span>}</span>
                <span className="font-mono text-faint">{a.ip || "—"} · {new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
