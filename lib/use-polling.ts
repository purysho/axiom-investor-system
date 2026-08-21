"use client";

import { useEffect, useRef } from "react";

/**
 * Live-update primitive: poll `fn` every `intervalMs`, but only while the tab
 * is visible — a hidden dashboard asking for quotes is pure waste. Fires once
 * immediately on mount and again on the moment the tab becomes visible, so
 * returning users never look at stale numbers while waiting for the next tick.
 *
 * Deliberately polling, not websockets: our data sources are delayed/EOD and
 * broker state moves at order speed, so a socket would add infrastructure to
 * deliver numbers that change slower than the poll. Revisit when a real-time
 * provider lands in lib/market-data.
 */
export function usePolling(fn: () => void | Promise<void>, intervalMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => { void fnRef.current(); };

    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
