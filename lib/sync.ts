"use client";

import { useSyncExternalStore } from "react";
import type { AppState } from "./engine/types";
import { defaultState, getLocalUpdatedAt, getState, replaceState, subscribeStore } from "./store";

export type SyncMode = "checking" | "local" | "synced" | "syncing" | "offline-error" | "conflict";

interface SyncStatus {
  mode: SyncMode;
  at: string | null; // last confirmed server updatedAt
  detail?: string;
}

let status: SyncStatus = { mode: "checking", at: null };
let serverUpdatedAt: string | null = null;
let conflictServerCopy: { data: AppState; updatedAt: string } | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let suppressNextPush = false;
let booted = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const setStatus = (s: SyncStatus) => {
  status = s;
  emit();
};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => status,
  );
}

function isDefaultish(s: AppState): boolean {
  return (
    s.trades.length === 0 &&
    s.holdings.length === 0 &&
    s.watchRules.length === 0 &&
    s.monthly.length === 0 &&
    Object.keys(s.dailyChecks).length === 0 &&
    s.weeklyReviews.length === 0
  );
}

async function push(force = false) {
  const body = { data: getState(), baseUpdatedAt: serverUpdatedAt, force };
  setStatus({ mode: "syncing", at: status.at });
  try {
    const res = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      setStatus({ mode: "local", at: null });
      return;
    }
    if (res.status === 409) {
      const j = await res.json();
      conflictServerCopy = { data: j.data as AppState, updatedAt: j.updatedAt as string };
      setStatus({ mode: "conflict", at: status.at, detail: "Another device saved more recently." });
      return;
    }
    if (!res.ok) throw new Error(String(res.status));
    const j = await res.json();
    serverUpdatedAt = j.updatedAt as string;
    setStatus({ mode: "synced", at: serverUpdatedAt });
  } catch {
    setStatus({ mode: "offline-error", at: status.at, detail: "Couldn't reach the server — changes are safe in this browser and will sync on the next save." });
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(false), 1500);
}

/** Keep whatever is on this device, overwriting the server copy. */
export function resolveKeepLocal() {
  conflictServerCopy = null;
  void push(true);
}

/** Adopt the server copy (a localStorage backup of the local copy is kept first). */
export function resolveUseServer() {
  if (!conflictServerCopy) return;
  try {
    window.localStorage.setItem("axiom.v1.preconflict", JSON.stringify(getState()));
  } catch {
    /* best effort */
  }
  suppressNextPush = true;
  serverUpdatedAt = conflictServerCopy.updatedAt;
  replaceState(conflictServerCopy.data);
  conflictServerCopy = null;
  setStatus({ mode: "synced", at: serverUpdatedAt });
}

export function initSync() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  subscribeStore(() => {
    if (suppressNextPush) {
      suppressNextPush = false;
      return;
    }
    if (status.mode === "local" || status.mode === "conflict") return;
    schedulePush();
  });

  void (async () => {
    try {
      const res = await fetch("/api/state");
      if (res.status === 401) {
        setStatus({ mode: "local", at: null });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { data: AppState | null; updatedAt: string | null };
      const local = getState();

      if (!j.data) {
        // Fresh account: adopt whatever this browser already has.
        if (!isDefaultish(local)) await push(true);
        else setStatus({ mode: "synced", at: null });
        return;
      }

      serverUpdatedAt = j.updatedAt;
      const localAt = getLocalUpdatedAt();
      const serverNewer = !localAt || (j.updatedAt !== null && j.updatedAt > localAt);

      if (isDefaultish(local) || serverNewer) {
        try {
          window.localStorage.setItem("axiom.v1.preload", JSON.stringify(local));
        } catch {
          /* best effort */
        }
        suppressNextPush = true;
        replaceState(j.data);
        setStatus({ mode: "synced", at: j.updatedAt });
      } else {
        // Local is newer (e.g. edits made while the network was down) → push it up.
        await push(false);
      }
    } catch {
      setStatus({ mode: "offline-error", at: null, detail: "Server unreachable — running from this browser's copy." });
    }
  })();
}

const MODE_LABEL: Record<SyncMode, string> = {
  checking: "sync: checking…",
  local: "offline mode — this browser only",
  synced: "synced",
  syncing: "syncing…",
  "offline-error": "offline — local copy",
  conflict: "sync conflict",
};

export function syncLabel(s: SyncStatus): string {
  if (s.mode === "synced" && s.at) return `synced ${new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return MODE_LABEL[s.mode];
}
