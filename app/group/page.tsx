"use client";

import { useEffect, useState } from "react";
import { fmtPct, fmtR, Panel } from "@/components/chrome";

interface Snapshot {
  gateState: string;
  adherencePct: number | null;
  expectancyR: number | null;
  closedCount: number;
  openCount: number;
  lastCheck: string | null;
  updatedAt: string;
}
interface Member {
  displayName: string;
  username: string;
  isYou: boolean;
  shared: boolean;
  snapshot: Snapshot | null;
}
interface Invite {
  code: string;
  note: string;
  createdAt: string;
}

const gateColor = (s: string) =>
  s === "RISK ALLOWED" ? "#10241C" : s === "REDUCED RISK ONLY" ? "#F0B429" : s === "NO NEW SWINGS" ? "#E5484D" : "#7E8C99";

export default function GroupPage() {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [shareGroup, setShareGroup] = useState<boolean | null>(null);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [minted, setMinted] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [g, a, i] = await Promise.all([fetch("/api/group"), fetch("/api/account"), fetch("/api/invites")]);
      if (g.status === 401 || a.status === 401) {
        setOffline(true);
        return;
      }
      if (!g.ok || !a.ok) throw new Error("load");
      const gj = await g.json();
      const aj = await a.json();
      setMembers(gj.members as Member[]);
      setShareGroup(Boolean(aj.shareGroup));
      if (i.ok) setInvites(((await i.json()).invites as Invite[]) ?? []);
    } catch {
      setError("Couldn't reach the server — the group view needs a connection.");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleShare = async (next: boolean) => {
    setShareGroup(next); // optimistic
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareGroup: next }),
      });
      if (!res.ok) throw new Error();
      void load();
    } catch {
      setShareGroup(!next);
      setError("Couldn't save the sharing setting.");
    }
  };

  const mint = async () => {
    setBusy(true);
    setMinted("");
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      setMinted(j.code as string);
      setNote("");
      void load();
    } catch {
      setError("Couldn't create an invite.");
    } finally {
      setBusy(false);
    }
  };

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {});
  };

  if (offline) {
    return (
      <Panel eyebrow="Accounts only" title="Group">
        <p className="text-xs leading-relaxed text-mut">
          You&apos;re in offline mode, so there&apos;s no group to show — this view compares process metrics across the
          invited members of a shared server.{" "}
          <a href="/login" className="underline decoration-line hover:decoration-[var(--gate)]">
            Sign in
          </a>{" "}
          (or join with an invite) to see it.
        </p>
      </Panel>
    );
  }

  return (
    <div className="grid gap-3">
      <Panel eyebrow="Accountability, not competition" title="The group">
        <p className="text-xs leading-relaxed text-mut">
          Members who opt in share <span className="font-mono text-ink">process metrics only</span> — gate state,
          rule adherence, expectancy, trade counts, and when they last ran the daily check. No positions, no
          tickers, no P&amp;L in dollars. The point is whether everyone is running their loops, not who is up the
          most.
        </p>
        {error && <p className="mt-2 font-mono text-[11px]" style={{ color: "#E5484D" }}>{error}</p>}
      </Panel>

      {shareGroup !== null && (
        <Panel eyebrow="Your visibility" title="Sharing">
          <label className="flex items-start gap-2 text-xs text-mut">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--gate)]"
              checked={shareGroup}
              onChange={(e) => void toggleShare(e.target.checked)}
            />
            <span>
              Share my process snapshot with the group. Off by default; turn it off any time and your row goes
              back to name-only immediately.
            </span>
          </label>
        </Panel>
      )}

      <Panel eyebrow={members ? `${members.length} member${members.length === 1 ? "" : "s"}` : "loading…"} title="Process snapshots">
        {!members ? (
          <p className="text-xs text-faint">Loading the group…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="eyebrow">
                  <th className="cell font-normal">Member</th>
                  <th className="cell font-normal">Gate</th>
                  <th className="cell font-normal">Adherence</th>
                  <th className="cell hidden font-normal sm:table-cell">Expectancy</th>
                  <th className="cell hidden font-normal sm:table-cell">Closed / open</th>
                  <th className="cell hidden font-normal md:table-cell">Last daily check</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.username} className="hover:bg-panel2">
                    <td className="cell">
                      {m.displayName}
                      {m.isYou && <span className="ml-1.5 text-faint">(you)</span>}
                    </td>
                    {m.snapshot ? (
                      <>
                        <td className="cell font-semibold" style={{ color: gateColor(m.snapshot.gateState) }}>
                          {m.snapshot.gateState}
                        </td>
                        <td className="cell text-mut">{fmtPct(m.snapshot.adherencePct, 0)}</td>
                        <td className="cell hidden text-mut sm:table-cell">{fmtR(m.snapshot.expectancyR)}</td>
                        <td className="cell hidden text-mut sm:table-cell">
                          {m.snapshot.closedCount} / {m.snapshot.openCount}
                        </td>
                        <td className="cell hidden text-faint md:table-cell">{m.snapshot.lastCheck ?? "—"}</td>
                      </>
                    ) : (
                      <td className="cell text-faint" colSpan={5}>
                        {m.shared ? "no synced data yet" : "not sharing"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel eyebrow="Grow the group deliberately" title="Invites">
        <p className="text-xs leading-relaxed text-mut">
          One code, one person, one use. Any member can mint an invite; there&apos;s no passphrase reset, so a fresh
          invite is also how a locked-out member gets back in (with a new account).
        </p>
        {invites.length > 0 && (
          <ul className="mt-2 grid gap-1 font-mono text-xs">
            {invites.map((inv) => (
              <li key={inv.code} className="flex flex-wrap items-center gap-2">
                <span className="text-ink">{inv.code}</span>
                <span className="text-faint">{inv.note}</span>
                <button type="button" className="btn !px-1.5 !py-0.5" onClick={() => copy(inv.code)}>
                  copy
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="field !w-56"
            placeholder="note (who it's for)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="button" className="btn-gate" onClick={() => void mint()} disabled={busy}>
            {busy ? "Creating…" : "New invite"}
          </button>
          {minted && (
            <span className="font-mono text-xs" style={{ color: "var(--gate)" }}>
              {minted} — copied? send it privately.
            </span>
          )}
        </div>
      </Panel>
    </div>
  );
}
