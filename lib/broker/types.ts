/**
 * Provider-agnostic broker interface. Nothing above this layer knows what
 * Alpaca is, so a second broker (IBKR, Trading212 if it ever ships an API)
 * slots in without touching the Copilot or the journal.
 *
 * Invariant: this layer NEVER decides what to trade. It receives a validated,
 * already-sized order and reports what the broker did.
 */

export type BrokerMode = "paper" | "live";
export type BrokerId = "alpaca";

export interface BrokerAccount {
  accountNumber: string;
  currency: string;
  equity: number;
  cash: number;
  buyingPower: number;
  /** Broker-enforced trading halt (PDT, margin call, restricted). */
  tradingBlocked: boolean;
  /** True when the broker says the account cannot open new positions. */
  restricted: boolean;
}

export interface BrokerPosition {
  symbol: string;
  qty: number;
  side: "long" | "short";
  avgEntryPrice: number;
  marketValue: number | null;
  unrealizedPl: number | null;
}

export interface BracketOrderRequest {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  /** Protective stop — mandatory. Axiom does not submit unprotected orders. */
  stopPrice: number;
  /** Optional profit target; creates a bracket when present. */
  takeProfitPrice?: number | null;
  /** Entry limit. Omit for a market entry. */
  limitPrice?: number | null;
  /** Idempotency key. Re-submitting the same id must not create a second order. */
  clientOrderId: string;
  timeInForce?: "day" | "gtc";
}

export type OrderStatus =
  | "accepted" | "new" | "partially_filled" | "filled"
  | "canceled" | "expired" | "rejected" | "pending" | "unknown";

export interface BrokerOrder {
  brokerOrderId: string;
  clientOrderId: string;
  symbol: string;
  qty: number;
  filledQty: number;
  filledAvgPrice: number | null;
  side: "buy" | "sell";
  status: OrderStatus;
  submittedAt: string;
  rawStatus: string;
}

export interface MarketClock {
  isOpen: boolean;
  nextOpen: string | null;
  nextClose: string | null;
}

export interface Broker {
  readonly id: BrokerId;
  readonly mode: BrokerMode;
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  getClock(): Promise<MarketClock>;
  /** Must be idempotent on clientOrderId. */
  submitBracketOrder(req: BracketOrderRequest): Promise<BrokerOrder>;
  getOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null>;
  listRecentOrders(limit?: number): Promise<BrokerOrder[]>;
  cancelOrder(brokerOrderId: string): Promise<void>;
}

export class BrokerError extends Error {
  constructor(message: string, readonly status?: number, readonly retryable = false) {
    super(message);
    this.name = "BrokerError";
  }
}
