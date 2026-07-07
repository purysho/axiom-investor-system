"use client";

import { useEffect } from "react";
import { initSync, resolveKeepLocal, resolveUseServer, syncLabel, useSyncStatus } from "@/lib/sync";

export function SyncBoot() {
  useEffect(() => {
    initSync();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* PWA is progressive — the app works without it */
      });
    }
  }, []);
  return <ConflictBanner />;
}

function ConflictBanner() {
  const s = useSyncStatus();
  if (s.mode !== "conflict") return null;
  return (
    <div className="panel mb-3 border-l-4 p-3" style={{ borderLeftColor: "#E7A83E" }} role="alertdialog" aria-label="Sync conflict">
      <div className="eyebrow" style={{ color: "#E7A83E" }}>
        Sync conflict
      </div>
      <p className="mt-1 text-xs leading-relaxed text-mut">
        Another device saved a newer copy of your data. Choose which to keep — the other is backed up in this
        browser either way.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-gate" onClick={resolveUseServer}>
          Load the newer copy
        </button>
        <button type="button" className="btn" onClick={resolveKeepLocal}>
          Keep this device&apos;s copy
        </button>
      </div>
    </div>
  );
}

export function SyncBadge() {
  const s = useSyncStatus();
  const color =
    s.mode === "synced" ? "#2FBF8F" : s.mode === "conflict" || s.mode === "offline-error" ? "#E7A83E" : "#55636F";
  return (
    <span className="font-mono text-[10px]" style={{ color }} title={s.detail}>
      {syncLabel(s)}
    </span>
  );
}
