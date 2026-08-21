import { randomUUID } from "node:crypto";
import { getDailyHistory } from "@/lib/market-data";
import { db } from "@/lib/server/db";
import type {
  Broker, BrokerAccount, BrokerOrder, BrokerPosition, BracketOrderRequest, MarketClock,
} from "./types";
import type { DailyRow } from "@/lib/engine/quotes";

/**
 * Built-in paper broker — no API keys, no signup, no tax information.
 * Fills bracket orders immediately against the last daily close from the
 * free market-data feed, stores positions in sim_positions, tracks cash
 * in sim_accounts, and writes synthetic sell orders to broker_orders when
 * a stop or take-profit level is hit so the close-detect layer can sync
 * the journal without any changes.
 *
 * Invariant: the sim is always mode="paper". A live SimBroker is
 * architecturally impossible — there is no external account to route to.
 */

export const SIM_INITIAL_EQUITY = 10_000;

/**
 * Per-side slippage in basis points — the SAME 5 bps the backtester charges
 * (lib/engine/backtest.ts), so sim results and backtest results stay
 * comparable: buys fill slightly worse than the reference price, sells too.
 */
export const SIM_SLIPPAGE_BPS = 5;
const SLIP = SIM_SLIPPAGE_BPS / 10_000;

/** Reference price → charged fill price. Pure, exported for tests. */
export function applySlippage(price: number, side: "buy" | "sell"): number {
  return side === "buy" ? price * (1 + SLIP) : price * (1 - SLIP);
}

/** Pure helper: NYSE trading hours, usable in tests without a DB. */
export function nyseClock(now: Date): MarketClock {
  // Convert to ET. Approximate: use fixed UTC-4 (EDT) and UTC-5 (EST) by month.
  const m = now.getUTCMonth() + 1; // 1–12
  const offsetHours = m >= 3 && m <= 10 ? 4 : 5; // rough EDT/EST split
  const etMs = now.getTime() - offsetHours * 3_600_000;
  const et = new Date(etMs);
  const day = et.getUTCDay(); // 0=Sun … 6=Sat
  const minutes = et.getUTCHours() * 60 + et.getUTCMinutes();
  const isOpen = day >= 1 && day <= 5 && minutes >= 570 && minutes < 960;
  return { isOpen, nextOpen: null, nextClose: null };
}

/**
 * Pure helper: given the last daily bar and bracket levels, decide whether
 * either exit was triggered on that bar.
 */
export function checkExitLevel(
  bar: DailyRow,
  stopPrice: number | null,
  takeProfitPrice: number | null,
): { exit: true; price: number; reason: "stop" | "target" } | { exit: false } {
  // Stop takes priority (conservative, mirrors the backtest's stop-first rule).
  if (stopPrice !== null && bar.low <= stopPrice) {
    return { exit: true, price: stopPrice, reason: "stop" };
  }
  if (takeProfitPrice !== null && bar.high >= takeProfitPrice) {
    return { exit: true, price: takeProfitPrice, reason: "target" };
  }
  return { exit: false };
}

function rowToOrder(r: Record<string, unknown>): BrokerOrder {
  return {
    brokerOrderId: String(r.broker_order_id ?? r.client_order_id),
    clientOrderId: String(r.client_order_id),
    symbol: String(r.symbol),
    qty: Number(r.qty),
    filledQty: Number(r.filled_qty ?? 0),
    filledAvgPrice: r.filled_avg_price != null ? Number(r.filled_avg_price) : null,
    side: String(r.side) === "sell" ? "sell" : "buy",
    status: String(r.status ?? "unknown") as BrokerOrder["status"],
    submittedAt: String(r.submitted_at),
    rawStatus: String(r.status ?? "unknown"),
  };
}

export class SimBroker implements Broker {
  readonly id = "sim" as const;
  readonly mode = "paper" as const;

  constructor(private readonly userId: string) {}

  async getAccount(): Promise<BrokerAccount> {
    const c = await db();
    const now = new Date().toISOString();
    const row = (await c.execute({
      sql: "SELECT cash FROM sim_accounts WHERE user_id = ?",
      args: [this.userId],
    })).rows[0];

    if (!row) {
      await c.execute({
        sql: `INSERT OR IGNORE INTO sim_accounts (user_id, initial_equity, cash, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [this.userId, SIM_INITIAL_EQUITY, SIM_INITIAL_EQUITY, now, now],
      });
      return this._accountShape(SIM_INITIAL_EQUITY, SIM_INITIAL_EQUITY);
    }

    const cash = Number(row.cash);
    const positions = await this.getPositions();
    const posValue = positions.reduce((s, p) => s + (p.marketValue ?? 0), 0);
    return this._accountShape(cash + posValue, cash);
  }

  private _accountShape(equity: number, cash: number): BrokerAccount {
    return {
      accountNumber: "SIM",
      currency: "USD",
      equity,
      cash,
      buyingPower: cash,
      tradingBlocked: false,
      restricted: false,
    };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const c = await db();
    const rows = (await c.execute({
      sql: "SELECT * FROM sim_positions WHERE user_id = ?",
      args: [this.userId],
    })).rows;

    const open: BrokerPosition[] = [];

    for (const row of rows) {
      const symbol = String(row.symbol);
      const qty = Number(row.qty);
      const avgEntry = Number(row.avg_entry_price);
      const stopPrice = row.stop_price != null ? Number(row.stop_price) : null;
      const tpPrice = row.take_profit_price != null ? Number(row.take_profit_price) : null;

      const bars = await getDailyHistory(symbol, 2).catch(() => null);
      const lastBar = bars?.[bars.length - 1];

      if (lastBar) {
        const exitCheck = checkExitLevel(lastBar, stopPrice, tpPrice);
        if (exitCheck.exit) {
          await this._closePosition(String(row.id), symbol, qty, applySlippage(exitCheck.price, "sell"));
          continue; // position closed — not returned
        }
      }

      const price = lastBar?.close ?? avgEntry;
      open.push({
        symbol,
        qty,
        side: "long",
        avgEntryPrice: avgEntry,
        marketValue: price * qty,
        unrealizedPl: (price - avgEntry) * qty,
      });
    }

    return open;
  }

  private async _closePosition(
    positionId: string, symbol: string, qty: number, exitPrice: number,
  ): Promise<void> {
    const c = await db();
    const now = new Date().toISOString();
    const proceeds = exitPrice * qty;
    const exitOrderId = `sim-exit-${randomUUID()}`;

    await c.execute({
      sql: "UPDATE sim_accounts SET cash = cash + ?, updated_at = ? WHERE user_id = ?",
      args: [proceeds, now, this.userId],
    });
    await c.execute({ sql: "DELETE FROM sim_positions WHERE id = ?", args: [positionId] });

    // Synthetic sell so close-detect can reconcile the journal trade.
    await c.execute({
      sql: `INSERT OR IGNORE INTO broker_orders
            (client_order_id, user_id, recommendation_id, broker, mode, symbol, side, qty,
             entry, stop, take_profit, broker_order_id, status, filled_qty, filled_avg_price,
             submitted_at, updated_at)
            VALUES (?, ?, NULL, 'sim', 'paper', ?, 'sell', ?, NULL, NULL, NULL, ?, 'filled', ?, ?, ?, ?)`,
      args: [exitOrderId, this.userId, symbol, qty, exitOrderId, qty, exitPrice, now, now],
    });
  }

  async getClock(): Promise<MarketClock> {
    return nyseClock(new Date());
  }

  async submitBracketOrder(req: BracketOrderRequest): Promise<BrokerOrder> {
    // Idempotency: entry order already recorded by execute-order.ts as 'pending'.
    // We must not double-fill. Look for an existing filled record.
    const existing = await this._getFilledOrder(req.clientOrderId);
    if (existing) return existing;

    // Fill at last close plus slippage (same 5 bps the backtester charges);
    // fall back to a small buffer above the stop when the feed has no bar.
    let fillPrice: number;
    try {
      const bars = await getDailyHistory(req.symbol, 2);
      fillPrice = applySlippage(bars?.[bars.length - 1]?.close ?? req.stopPrice * 1.05, req.side);
    } catch {
      fillPrice = applySlippage(req.stopPrice * 1.05, req.side);
    }

    const c = await db();
    const now = new Date().toISOString();

    // Cash check — read directly to avoid recursive getPositions() call.
    const cashRow = (await c.execute({
      sql: "SELECT cash FROM sim_accounts WHERE user_id = ?",
      args: [this.userId],
    })).rows[0];
    const cash = cashRow ? Number(cashRow.cash) : SIM_INITIAL_EQUITY;
    const cost = fillPrice * req.qty;

    const orderId = randomUUID();
    const status: BrokerOrder["status"] = cost > cash ? "rejected" : "filled";

    if (status === "filled") {
      await c.execute({
        sql: "UPDATE sim_accounts SET cash = cash - ?, updated_at = ? WHERE user_id = ?",
        args: [cost, now, this.userId],
      });
      await c.execute({
        sql: `INSERT INTO sim_positions
              (id, user_id, client_order_id, symbol, qty, side, avg_entry_price,
               stop_price, take_profit_price, opened_at)
              VALUES (?, ?, ?, ?, ?, 'long', ?, ?, ?, ?)`,
        args: [
          randomUUID(), this.userId, req.clientOrderId, req.symbol, req.qty,
          fillPrice, req.stopPrice, req.takeProfitPrice ?? null, now,
        ],
      });
    }

    // execute-order.ts wrote 'pending'; just return the result — it will UPDATE the row.
    return {
      brokerOrderId: orderId,
      clientOrderId: req.clientOrderId,
      symbol: req.symbol,
      qty: req.qty,
      filledQty: status === "filled" ? req.qty : 0,
      filledAvgPrice: status === "filled" ? fillPrice : null,
      side: req.side,
      status,
      submittedAt: now,
      rawStatus: status,
    };
  }

  /** Returns the order only if it is already in a terminal state (not pending). */
  private async _getFilledOrder(clientOrderId: string): Promise<BrokerOrder | null> {
    const c = await db();
    const r = (await c.execute({
      sql: "SELECT * FROM broker_orders WHERE client_order_id = ? AND broker = 'sim' AND status != 'pending'",
      args: [clientOrderId],
    })).rows[0];
    return r ? rowToOrder(r) : null;
  }

  async getOrderByClientId(clientOrderId: string): Promise<BrokerOrder | null> {
    const c = await db();
    const r = (await c.execute({
      sql: "SELECT * FROM broker_orders WHERE client_order_id = ? AND broker = 'sim'",
      args: [clientOrderId],
    })).rows[0];
    return r ? rowToOrder(r) : null;
  }

  async listRecentOrders(limit = 50): Promise<BrokerOrder[]> {
    const c = await db();
    const rows = (await c.execute({
      sql: "SELECT * FROM broker_orders WHERE user_id = ? AND broker = 'sim' ORDER BY submitted_at DESC LIMIT ?",
      args: [this.userId, limit],
    })).rows;
    return rows.map(rowToOrder);
  }

  async cancelOrder(brokerOrderId: string): Promise<void> {
    const c = await db();
    await c.execute({
      sql: "UPDATE broker_orders SET status = 'canceled', updated_at = ? WHERE broker_order_id = ? AND broker = 'sim' AND user_id = ?",
      args: [new Date().toISOString(), brokerOrderId, this.userId],
    });
  }
}
