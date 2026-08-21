import { describe, expect, it } from "vitest";
import { classifySymbol, listProviders, providerFor, resolveHistory } from "@/lib/market-data";
import { StooqProvider } from "@/lib/market-data/stooq";
import { AlpacaDataProvider, mapAlpacaBars } from "@/lib/market-data/alpaca";
import type { DailyRow } from "@/lib/engine/quotes";
import type { MarketAssetClass, MarketDataProvider } from "@/lib/market-data/types";

describe("classifySymbol", () => {
  it("recognizes each asset class from the symbol conventions", () => {
    const cases: Array<[string, MarketAssetClass]> = [
      ["AAPL", "Equity"],
      ["SPY", "ETF"],
      ["QQQ", "ETF"],
      ["BTCUSD", "Crypto"],
      ["ETHUSD", "Crypto"],
      ["EURUSD", "FX"],
      ["XAUUSD", "Metal"],
      ["TLT", "Bond"],
      ["AGG", "Bond"],
      ["vusa.uk", "Other"],   // explicit exchange suffix — provider's problem
      ["^SPX", "Other"],
      ["", "Other"],
    ];
    for (const [symbol, expected] of cases) expect(classifySymbol(symbol)).toBe(expected);
  });

  it("is case-insensitive and trims", () => {
    expect(classifySymbol("  btcusd ")).toBe("Crypto");
    expect(classifySymbol("aapl")).toBe("Equity");
  });
});

describe("provider registry", () => {
  it("serves every roadmap asset class except raw commodities", () => {
    const stooq = new StooqProvider();
    for (const ac of ["Equity", "ETF", "Crypto", "FX", "Metal", "Bond", "Other"] as MarketAssetClass[]) {
      expect(stooq.supports(ac)).toBe(true);
    }
    expect(stooq.supports("Commodity")).toBe(false);
  });

  it("routes symbols to a provider", () => {
    expect(providerFor("AAPL")?.id).toBe("stooq");
    expect(providerFor("BTCUSD")?.id).toBe("stooq");
    expect(providerFor("XAUUSD")?.id).toBe("stooq");
  });

  it("exposes the registered providers with their data caveats", () => {
    const providers = listProviders();
    expect(providers.length).toBeGreaterThan(0);
    // Without Alpaca data creds in the test env, Stooq is the only/first provider.
    expect(providers.some((p) => p.id === "stooq")).toBe(true);
    expect(providers.find((p) => p.id === "stooq")?.label).toMatch(/delayed/i);
  });
});

describe("AlpacaDataProvider", () => {
  it("serves stock-shaped classes and defers FX/metal/crypto", () => {
    const a = new AlpacaDataProvider();
    expect(a.supports("Equity")).toBe(true);
    expect(a.supports("ETF")).toBe(true);
    expect(a.supports("Bond")).toBe(true);
    expect(a.supports("FX")).toBe(false);
    expect(a.supports("Metal")).toBe(false);
    expect(a.supports("Crypto")).toBe(false);
  });

  it("maps Alpaca bars to the DailyRow shape and drops malformed rows", () => {
    const rows = mapAlpacaBars([
      { t: "2025-02-03T05:00:00Z", o: 10, h: 11, l: 9, c: 10.5, v: 1000 },
      // @ts-expect-error deliberately malformed — no close
      { t: "2025-02-04T05:00:00Z", o: 10 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ date: "2025-02-03", open: 10, high: 11, low: 9, close: 10.5, volume: 1000 });
  });
});

describe("resolveHistory fallback", () => {
  const fake = (id: string, supported: MarketAssetClass[], rows: DailyRow[] | null): MarketDataProvider => ({
    id, label: id,
    supports: (ac) => supported.includes(ac),
    getDailyHistory: async () => rows,
  });
  const bar: DailyRow = { date: "2025-01-02", open: 1, high: 1, low: 1, close: 1, volume: 1 };

  it("returns the first provider that yields data", async () => {
    const first = fake("first", ["Equity"], [bar]);
    const second = fake("second", ["Equity"], [{ ...bar, close: 2 }]);
    const out = await resolveHistory([first, second], "AAPL", 100);
    expect(out?.[0].close).toBe(1);
  });

  it("falls through when the higher-priority provider returns null", async () => {
    const empty = fake("empty", ["Equity"], null);
    const backup = fake("backup", ["Equity"], [bar]);
    const out = await resolveHistory([empty, backup], "AAPL", 100);
    expect(out).toEqual([bar]);
  });

  it("skips providers that don't support the asset class", async () => {
    const wrongClass = fake("wrong", ["FX"], [{ ...bar, close: 99 }]);
    const right = fake("right", ["Equity"], [bar]);
    const out = await resolveHistory([wrongClass, right], "AAPL", 100);
    expect(out?.[0].close).toBe(1);
  });

  it("returns null when nothing supplies data", async () => {
    const out = await resolveHistory([fake("a", ["Equity"], null)], "AAPL", 100);
    expect(out).toBeNull();
  });
});
