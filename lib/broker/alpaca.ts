import {
  BrokerError,
  type BracketOrderRequest, type Broker, type BrokerAccount, type BrokerMode,
  type BrokerOrder, type BrokerPosition, type MarketClock, type OrderStatus,
} from "./types";

const PAPER_BASE = "https://paper-api.alpaca.markets";
const LIVE_BASE = "https://api.alpaca.markets";

/** ALPACA_BASE_URL overrides the endpoint (used by the mock server in tests). */
function baseUrl(mode: BrokerMode): string {
  return process.env.ALPACA_BASE_URL ?? (mode === "live" ? LIVE_BASE : PAPER_BASE);
}

function mapStatus(s: string): OrderStatus {
  switch (s) {
    case "new": case "accepted": case "accepted_for_bidding": return "new";
    case "partially_filled": return "partially_filled";
    case "filled": return "filled";
    case "canceled": case "pending_cancel": return "canceled";
    case "expired": return "expired";
    case "rejected": case "suspended": return "rejected";
    case "pending_new": case "held": return "pending";
    default: return "unknown";
  }
}

interface AlpacaOrder {
  id: string; client_order_id: string; symbol: string;
  qty: string | null; filled_qty: string | null; filled_avg_price: string | null;
  side: string; status: string; submitted_at: string;
}

function toOrder(o: AlpacaOrder): BrokerOrder {
  return {
    brokerOrderId: o.id,
    clientOrderId: o.client_order_id,
    symbol: o.symbol,
    qty: Number(o.qty ?? 0),
    filledQty: Number(o.filled_qty ?? 0),
    filledAvgPrice: o.filled_avg_price != null ? Number(o.filled_avg_price) : null,
    side: o.side === "sell" ? "sell" : "buy",
    status: mapStatus(o.status),
    submittedAt: o.submitted_at,
    rawStatus: o.status,
  };
}

export class AlpacaBroker implements Broker {
  readonly id = "alpaca" as const;

  constructor(
    private readonly keyId: string,
    private readonly secret: string,
    readonly mode: BrokerMode,
  ) {}

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl(this.mode)}${path}`, {
        ...init,
        headers: {
          "APCA-API-KEY-ID": this.keyId,
          "APCA-API-SECRET-KEY": this.secret,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new BrokerError("Couldn't reach the broker. Check your connection and try again.", undefined, true);
    }

    if (res.status === 401 || res.status === 403)
      throw new BrokerError("The broker rejected your API keys. Reconnect in Settings.", res.status);
    if (res.status === 429)
      throw new BrokerError("The broker is rate-limiting us. Wait a moment.", 429, true);
    if (res.status >= 500)
      throw new BrokerError("The broker is having problems. Nothing was submitted.", res.status, true);

    const text = await res.text();
    const body = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = typeof body?.message === "string" ? body.message : `Broker error (${res.status}).`;
      throw new BrokerError(msg, res.status);
    }
    return body as T;
  }

  async getAccount(): Promise<BrokerAccount> {
    const a = await this.call<{
      account_number: string; currency: string; equity: string; cash: string; buying_power: string;
      trading_blocked: boolean; account_blocked: boolean; trade_suspended_by_user?: boolean;
    }>("/v2/account");
    return {
      accountNumber: a.account_number,
      currency: a.currency,
      equity: Number(a.equity),
      cash: Number(a.cash),
      buyingPower: Number(a.buying_power),
      tradingBlocked: Boolean(a.trading_blocked),
      restricted: Boolean(a.account_blocked || a.trading_blocked || a.trade_suspended_by_user),
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const rows = await this.call<Array<{
      symbol: string; qty: string; side: string; avg_entry_price: string;
      market_value: string | null; unrealized_pl: string | null;
    }>>("/v2/positions");
    return rows.map((p) => ({
      symbol: p.symbol,
      qty: Number(p.qty),
      side: p.side === "short" ? "short" : "long",
      avgEntryPrice: Number(p.avg_entry_price),
      marketValue: p.market_value != null ? Number(p.market_value) : null,
      unrealizedPl: p.unrealized_pl != null ? Number(p.unrealized_pl) : null,
    }));
  }

  async getClock(): Promise<MarketClock> {
    const c = await this.call<{ is_open: boolean; next_open: string; next_close: string }>("/v2/clock");
    return { isOpen: Boolean(c.is_open), nextOpen: c.next_open ?? null, nextClose: c.next_close ?? null };
  }

  async submitBracketOrder(req: BracketOrderRequest): Promise<BrokerOrder> {
    // Idempotency: if this clientOrderId already exists, return it instead of duplicating.
    const existing = await this.getOrderByClientId(req.clientOrderId);
    if (existing) return existing;

    const payload: Record<string, unknown> = {
      symbol: req.symbol,
      qty: String(req.qty),
      side: req.side,
      type: req.limitPrice != null ? "limit" : "market",
      time_in_force: req.timeInForce ?? "day",
      client_order_id: req.clientOrderId,
      order_class: req.takeProfitPrice != null ? "bracket" : "oto",
      stop_loss: { stop_price: String(req.stopPrice) },
    };
    if (req.limitPrice != null) payload.limit_price = String(req.limitPrice);
    if (req.takeProfitPrice != null) payload.take_profit = { limit_price: String(req.takeProfitPrice) };

    const o = await this.call<AlpacaOrder>("/v2/orders", { method: "POST", body: JSON.stringify(payload) });
    return toOrder(o);
  }

  async getOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null> {
    try {
      const o = await this.call<AlpacaOrder>(`/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`);
      return toOrder(o);
    } catch (e) {
      if (e instanceof BrokerError && e.status === 404) return null;
      // A lookup failure must not be read as "no order exists" — that would risk a duplicate.
      if (e instanceof BrokerError && e.status === undefined) throw e;
      return null;
    }
  }

  async listRecentOrders(limit = 50): Promise<BrokerOrder[]> {
    const rows = await this.call<AlpacaOrder[]>(`/v2/orders?status=all&limit=${limit}&direction=desc`);
    return rows.map(toOrder);
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    await this.call(`/v2/orders/${encodeURIComponent(brokerOrderId)}`, { method: "DELETE" });
  }
}
