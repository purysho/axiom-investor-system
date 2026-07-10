import { describe, expect, it } from "vitest";
import { nyseClock, checkExitLevel } from "@/lib/broker/sim";

describe("nyseClock", () => {
  const mkDate = (iso: string) => new Date(iso);

  it("market is open during NYSE hours on a weekday", () => {
    // Tuesday 14:00 UTC in March = 10:00 EDT → open
    const c = nyseClock(mkDate("2026-03-10T14:00:00Z"));
    expect(c.isOpen).toBe(true);
  });

  it("market is closed before 9:30 ET", () => {
    // Tuesday 12:00 UTC in March = 08:00 EDT → closed
    const c = nyseClock(mkDate("2026-03-10T12:00:00Z"));
    expect(c.isOpen).toBe(false);
  });

  it("market is closed after 16:00 ET", () => {
    // Tuesday 21:00 UTC in March = 17:00 EDT → closed
    const c = nyseClock(mkDate("2026-03-10T21:00:00Z"));
    expect(c.isOpen).toBe(false);
  });

  it("market is closed on weekends", () => {
    // Saturday 14:00 UTC
    const c = nyseClock(mkDate("2026-03-14T14:00:00Z"));
    expect(c.isOpen).toBe(false);
  });
});

describe("checkExitLevel", () => {
  const bar = (low: number, high: number) => ({
    date: "2026-01-10",
    open: (low + high) / 2,
    high,
    low,
    close: (low + high) / 2,
    volume: 1_000_000,
  });

  it("returns no exit when neither level is touched", () => {
    const result = checkExitLevel(bar(95, 105), 90, 110);
    expect(result.exit).toBe(false);
  });

  it("detects a stop hit when bar low <= stop", () => {
    const result = checkExitLevel(bar(88, 102), 90, 110);
    expect(result).toMatchObject({ exit: true, price: 90, reason: "stop" });
  });

  it("detects a take-profit hit when bar high >= target", () => {
    const result = checkExitLevel(bar(95, 115), 90, 110);
    expect(result).toMatchObject({ exit: true, price: 110, reason: "target" });
  });

  it("stop takes priority when both levels are touched on the same bar", () => {
    // Ambiguous bar: gap-down open that also ran to TP. Conservative = stop first.
    const result = checkExitLevel(bar(85, 115), 90, 110);
    expect(result).toMatchObject({ exit: true, reason: "stop" });
  });

  it("handles null stop gracefully", () => {
    const result = checkExitLevel(bar(85, 105), null, 110);
    expect(result.exit).toBe(false);
  });

  it("handles null take-profit gracefully", () => {
    const result = checkExitLevel(bar(88, 105), 90, null);
    expect(result).toMatchObject({ exit: true, reason: "stop" });
  });
});
