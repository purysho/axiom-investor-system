import { describe, expect, it } from "vitest";
import { applyCloses, detectClosedTrades } from "@/lib/broker/close-detect";
import type { BrokerOrder, BrokerPosition } from "@/lib/broker/types";
import { baseRec, baseState, makeTrade } from "./helpers";

/**
 * When a bracket's stop or take-profit leg fills at the broker, the journal
 * trade must close with the real fill — but ONLY for trades provably routed
 * through the broker, and only when a closing fill can be found.
 */

function withBrokerTrade(opts: { stop?: number | null; target?: number | null } = {}) {
  const state = baseState();
  const trade = makeTrade({
    id: "T-BROKER", ticker: "SPY", status: "Open",
    entryDate: "2026-01-05", exitDate: "", exitPrice: null, exitReason: "",
    entry: 100, stop: opts.stop === undefined ? 96 : opts.stop, target: opts.target === undefined ? 108 : opts.target,
    shares: 10,
  });
  state.trades = [trade];
  state.recommendations = [baseRec({ id: "R-BROKER", executedTradeId: "T-BROKER" })];
  return state;
}

const sellFill = (price: number, submittedAt = "2026-01-08T15:30:00Z"): BrokerOrder => ({
  brokerOrderId: "B1", clientOrderId: "leg", symbol: "SPY", qty: 10, filledQty: 10,
  filledAvgPrice: price, side: "sell", status: "filled", submittedAt, rawStatus: "filled",
});

const position = (symbol: string, qty = 10): BrokerPosition => ({
  symbol, qty, side: "long", avgEntryPrice: 100, marketValue: null, unrealizedPl: null,
});

describe("detectClosedTrades", () => {
  const filledRecIds = new Set(["R-BROKER"]);

  it("closes a stopped-out trade with the real fill and reason Stop", () => {
    const closes = detectClosedTrades(withBrokerTrade(), [], [sellFill(95.9)], filledRecIds);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({ tradeId: "T-BROKER", exitPrice: 95.9, exitReason: "Stop", exitDate: "2026-01-08" });
  });

  it("closes a target hit with reason Target", () => {
    const closes = detectClosedTrades(withBrokerTrade(), [], [sellFill(108.2)], filledRecIds);
    expect(closes[0].exitReason).toBe("Target");
  });

  it("labels an in-between fill Manual/Discretionary", () => {
    const closes = detectClosedTrades(withBrokerTrade(), [], [sellFill(101.5)], filledRecIds);
    expect(closes[0].exitReason).toBe("Manual/Discretionary");
  });

  it("leaves the trade alone while the position is still on the book", () => {
    const closes = detectClosedTrades(withBrokerTrade(), [position("SPY")], [sellFill(95.9)], filledRecIds);
    expect(closes).toHaveLength(0);
  });

  it("never fabricates an exit when no closing fill is found", () => {
    const closes = detectClosedTrades(withBrokerTrade(), [], [], filledRecIds);
    expect(closes).toHaveLength(0);
  });

  it("ignores sell fills from before the trade was entered", () => {
    const closes = detectClosedTrades(withBrokerTrade(), [], [sellFill(95.9, "2026-01-02T15:30:00Z")], filledRecIds);
    expect(closes).toHaveLength(0);
  });

  it("never touches trades that did not go through the broker", () => {
    const state = withBrokerTrade();
    state.recommendations = [baseRec({ id: "R-PAPER-ONLY", executedTradeId: "T-BROKER" })]; // rec exists but never filled at broker
    const closes = detectClosedTrades(state, [], [sellFill(95.9)], filledRecIds);
    expect(closes).toHaveLength(0);
  });

  it("picks the newest closing fill when several exist", () => {
    const closes = detectClosedTrades(
      withBrokerTrade(), [],
      [sellFill(96.5, "2026-01-07T15:00:00Z"), sellFill(95.5, "2026-01-09T15:00:00Z")],
      filledRecIds,
    );
    expect(closes[0].exitPrice).toBe(95.5);
  });
});

describe("applyCloses", () => {
  it("closes exactly the instructed trades and leaves reflections empty", () => {
    const state = withBrokerTrade();
    const closes = detectClosedTrades(state, [], [sellFill(95.9)], new Set(["R-BROKER"]));
    const next = applyCloses(state, closes);
    const t = next.trades.find((x) => x.id === "T-BROKER")!;
    expect(t.status).toBe("Closed");
    expect(t.exitPrice).toBe(95.9);
    expect(t.exitReason).toBe("Stop");
    expect(t.lesson).toBe("learned something"); // untouched — makeTrade default
    expect(state.trades[0].status).toBe("Open"); // input state not mutated
  });

  it("is a no-op for an empty instruction list", () => {
    const state = withBrokerTrade();
    expect(applyCloses(state, [])).toBe(state);
  });
});
