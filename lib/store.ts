"use client";

import { DEFAULT_COPILOT } from "@/lib/copilot/types";
import { useSyncExternalStore } from "react";
import type { AppState } from "./engine/types";

const KEY = "axiom.v1";
const LEGACY_KEY = "ids.v1"; // pre-rebrand storage key — migrated on first load

export const defaultState: AppState = {
  settings: {
    portfolioValue: 100000,
    benchmarkName: "S&P 500",
    benchmarkSymbol: "spy.us",
    thresholds: { vixMax: 25, nfciMax: 0.5, maxDrawdownPct: 10, openRiskBudgetPct: 2 },
    riskPerTradePct: 0.5,
    heatCapPct: 6,
    notionalCapPct: 20,
  },
  gateInputs: {
    benchAbove200dma: null,
    benchClose: null,
    benchSma200: null,
    vix: null,
    nfci: null,
    drawdownPct: 0,
    binaryEventRisk: false,
  },
  dailyChecks: {},
  trades: [],
  holdings: [],
  watchRules: [],
  watchData: { rows: [], asOf: "", source: "" },
  monthly: [],
  weeklyReviews: [],
  recommendations: [],
  copilot: { ...DEFAULT_COPILOT },
};

let state: AppState = defaultState;
let hydrated = false;
const listeners = new Set<() => void>();

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    let raw = window.localStorage.getItem(KEY);
    if (!raw) {
      // One-time migration from the pre-rebrand key; the old copy is left in place as a backup.
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        raw = legacy;
        window.localStorage.setItem(KEY, legacy);
        const legacyAt = window.localStorage.getItem(`${LEGACY_KEY}.at`);
        if (legacyAt) window.localStorage.setItem(`${KEY}.at`, legacyAt);
      }
    }
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      state = {
        ...defaultState,
        ...parsed,
        settings: {
          ...defaultState.settings,
          ...parsed.settings,
          thresholds: { ...defaultState.settings.thresholds, ...parsed.settings?.thresholds },
        },
        gateInputs: { ...defaultState.gateInputs, ...parsed.gateInputs },
        watchData: { ...defaultState.watchData, ...parsed.watchData },
      };
    }
  } catch {
    // corrupt storage → start clean rather than crash
    state = defaultState;
  }
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) {
      try {
        state = { ...state, ...(JSON.parse(e.newValue) as AppState) };
        emit();
      } catch {
        /* ignore cross-tab corruption */
      }
    }
  });
}

function emit() {
  for (const l of listeners) l();
}

function persist() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.localStorage.setItem(`${KEY}.at`, new Date().toISOString());
  } catch {
    /* storage full/unavailable — state still lives in memory */
  }
}

/** ISO timestamp of the last local write, for sync reconciliation. Null before any write. */
export function getLocalUpdatedAt(): string | null {
  try {
    return window.localStorage.getItem(`${KEY}.at`);
  } catch {
    return null;
  }
}

/** Subscribe to store changes from outside React (used by the sync layer). */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getState(): AppState {
  return state;
}

/** Overwrite the entire store — used by restore-from-backup and load-demo. */
export function replaceState(next: AppState) {
  hydrate();
  state = next;
  persist();
  emit();
}

/** Wipe everything back to a clean slate. */
export function resetState() {
  replaceState(defaultState);
}

export function update(fn: (prev: AppState) => AppState) {
  hydrate();
  state = fn(state);
  persist();
  emit();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read the whole app state reactively. SSR-safe: server snapshot is the default state. */
export function useAppState(): AppState {
  return useSyncExternalStore(
    subscribe,
    () => {
      hydrate();
      return state;
    },
    () => defaultState,
  );
}

export function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isoWeekKey(d: Date = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
    .toString(36)
    .padStart(2, "0")}`.toUpperCase();
}
