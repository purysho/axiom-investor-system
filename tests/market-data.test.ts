import { describe, expect, it } from "vitest";
import { classifySymbol, listProviders, providerFor } from "@/lib/market-data";
import { StooqProvider } from "@/lib/market-data/stooq";
import type { MarketAssetClass } from "@/lib/market-data/types";

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
    expect(providers[0]).toMatchObject({ id: "stooq" });
    expect(providers[0].label).toMatch(/delayed/i);
  });
});
