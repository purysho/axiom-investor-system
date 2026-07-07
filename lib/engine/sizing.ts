export interface SizingInput {
  portfolioValue: number;
  riskPerTradePct: number; // % of portfolio
  entry: number | null;
  stop: number | null;
  target: number | null;
  notionalCapPct: number; // single-name cap, % of equity
}

export interface SizingResult {
  riskDollars: number;
  perShareRisk: number | null;
  maxSharesByRisk: number | null;
  cappedShares: number | null;
  capApplied: boolean;
  notional: number | null;
  exposurePct: number | null;
  rewardRisk: number | null;
  /** Illustrative gross P&L if price gaps 12% through the stop — planned risk is not max loss. */
  gapExamplePrice: number | null;
  gapExampleLoss: number | null;
}

/**
 * Size from risk, never from conviction:
 * riskDollars = equity × risk% → perShareRisk = |entry − stop| →
 * shares = floor(riskDollars / perShareRisk), then apply the single-name notional cap.
 */
export function computeSizing(i: SizingInput): SizingResult {
  const riskDollars = (i.portfolioValue * i.riskPerTradePct) / 100;
  const base: SizingResult = {
    riskDollars,
    perShareRisk: null,
    maxSharesByRisk: null,
    cappedShares: null,
    capApplied: false,
    notional: null,
    exposurePct: null,
    rewardRisk: null,
    gapExamplePrice: null,
    gapExampleLoss: null,
  };
  if (i.entry === null || i.stop === null || i.entry <= 0) return base;
  const perShareRisk = Math.abs(i.entry - i.stop);
  if (perShareRisk <= 0) return { ...base, perShareRisk: 0 };

  const maxSharesByRisk = Math.floor(riskDollars / perShareRisk);
  const capShares = Math.floor((i.portfolioValue * i.notionalCapPct) / 100 / i.entry);
  const capped = Math.min(maxSharesByRisk, capShares);
  const notional = capped * i.entry;

  const long = i.stop < i.entry;
  const gapExamplePrice = long ? i.stop * 0.88 : i.stop * 1.12;
  const gapExampleLoss = Math.abs(i.entry - gapExamplePrice) * capped;

  return {
    riskDollars,
    perShareRisk,
    maxSharesByRisk,
    cappedShares: capped,
    capApplied: capped < maxSharesByRisk,
    notional,
    exposurePct: i.portfolioValue > 0 ? (notional / i.portfolioValue) * 100 : null,
    rewardRisk:
      i.target !== null && perShareRisk > 0 ? Math.abs(i.target - i.entry) / perShareRisk : null,
    gapExamplePrice,
    gapExampleLoss,
  };
}
