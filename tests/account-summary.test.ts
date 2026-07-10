import { describe, expect, it } from "vitest";
import { summarizeAccount } from "@/lib/broker/account-summary";
import type { BrokerAccount, BrokerPosition } from "@/lib/broker/types";

const account: BrokerAccount = {
  accountNumber: "PA1", currency: "USD",
  equity: 100_000, cash: 60_000, buyingPower: 120_000,
  tradingBlocked: false, restricted: false,
};

const pos = (symbol: string, qty: number, marketValue: number | null, unrealizedPl: number | null): BrokerPosition => ({
  symbol, qty, side: qty >= 0 ? "long" : "short", avgEntryPrice: 100, marketValue, unrealizedPl,
});

describe("summarizeAccount", () => {
  it("aggregates positions value, unrealized P&L, and the largest weight", () => {
    const s = summarizeAccount(account, [
      pos("AAPL", 100, 25_000, 1_200),
      pos("MSFT", 30, 15_000, -400),
    ]);
    expect(s.positionsValue).toBe(40_000);
    expect(s.unrealizedPl).toBe(800);
    expect(s.largestSymbol).toBe("AAPL");
    expect(s.largestPct).toBeCloseTo(25, 5);
    expect(s.positionCount).toBe(2);
  });

  it("degrades to nulls when the broker omits values", () => {
    const s = summarizeAccount(account, [pos("AAPL", 10, null, null)]);
    expect(s.positionsValue).toBe(0);
    expect(s.unrealizedPl).toBeNull();
    expect(s.largestSymbol).toBeNull();
    expect(s.positionCount).toBe(1);
  });

  it("handles a flat account", () => {
    const s = summarizeAccount(account, []);
    expect(s).toMatchObject({ positionsValue: 0, unrealizedPl: null, largestPct: null, positionCount: 0, equity: 100_000 });
  });

  it("uses absolute values so shorts count toward exposure, not against it", () => {
    const s = summarizeAccount(account, [pos("XYZ", -50, -20_000, 500)]);
    expect(s.positionsValue).toBe(20_000);
    expect(s.largestPct).toBeCloseTo(20, 5);
  });
});
