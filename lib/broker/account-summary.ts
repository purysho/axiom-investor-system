import type { BrokerAccount, BrokerPosition } from "./types";

/**
 * Pure aggregation over live broker snapshots, for the live-account panel.
 * No I/O; the API route fetches, this summarizes, the client renders.
 */

export interface AccountSummary {
  equity: number;
  cash: number;
  /** Market value of open positions (sum of |position value|). */
  positionsValue: number;
  /** Sum of unrealized P&L over positions that report one. */
  unrealizedPl: number | null;
  /** Largest single position as % of equity, with its symbol. */
  largestPct: number | null;
  largestSymbol: string | null;
  positionCount: number;
}

export function summarizeAccount(account: BrokerAccount, positions: BrokerPosition[]): AccountSummary {
  const withMv = positions.filter((p) => p.marketValue !== null);
  const positionsValue = withMv.reduce((a, p) => a + Math.abs(p.marketValue as number), 0);

  const withPl = positions.filter((p) => p.unrealizedPl !== null);
  const unrealizedPl = withPl.length ? withPl.reduce((a, p) => a + (p.unrealizedPl as number), 0) : null;

  const largest = withMv
    .slice()
    .sort((a, b) => Math.abs(b.marketValue as number) - Math.abs(a.marketValue as number))[0];

  return {
    equity: account.equity,
    cash: account.cash,
    positionsValue,
    unrealizedPl,
    largestPct: largest && account.equity > 0 ? (Math.abs(largest.marketValue as number) / account.equity) * 100 : null,
    largestSymbol: largest?.symbol ?? null,
    positionCount: positions.filter((p) => p.qty !== 0).length,
  };
}
