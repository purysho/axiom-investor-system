"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type DeepPartial,
  type ChartOptions,
} from "lightweight-charts";

export interface Candle {
  time: string;
  open: number; high: number; low: number; close: number;
  volume?: number | null;
  sma20?: number | null; sma50?: number | null; sma200?: number | null;
  ema20?: number | null;
  bbUpper?: number | null; bbMid?: number | null; bbLower?: number | null;
  macd?: number | null; macdSig?: number | null; macdHist?: number | null;
  rsi?: number | null;
}

export type ChartMode = "simple" | "pro";

export interface Indicators {
  sma20?: boolean; sma50?: boolean; sma200?: boolean; ema20?: boolean;
  bb?: boolean; volume?: boolean; rsi?: boolean; macd?: boolean;
}

const T = {
  bg: "#121714", grid: "#1B221D", border: "#27312B", text: "#93A39A",
  up: "#34D399", down: "#F4645C",
  sma20: "#6FA8DC", sma50: "#F0B429", sma200: "#F4645C", ema20: "#B48CF2",
  bb: "#5C6B62", rsi: "#6FA8DC", macdPos: "#34D399", macdNeg: "#F4645C",
  macdSig: "#F0B429", volUp: "#1F4636", volDown: "#4A1F1F",
};

const baseOpts = (h: number): DeepPartial<ChartOptions> => ({
  width: 0, height: h,
  layout: {
    background: { type: ColorType.Solid, color: T.bg },
    textColor: T.text,
    fontFamily: "DM Sans, Inter, system-ui",
    fontSize: 11,
  },
  grid: { vertLines: { color: T.grid }, horzLines: { color: T.grid } },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: T.border, scaleMargins: { top: 0.08, bottom: 0.08 } },
  timeScale: { borderColor: T.border, timeVisible: true, fixLeftEdge: true, fixRightEdge: true },
  handleScroll: true, handleScale: true,
});

const valid = (candles: Candle[], key: keyof Candle) =>
  candles.filter((c) => c[key] != null).map((c) => ({ time: c.time, value: c[key] as number }));

export default function MarketChart({
  candles, mode, indicators, height = 420,
}: {
  candles: Candle[]; mode: ChartMode; indicators: Indicators; height?: number;
}) {
  const priceEl = useRef<HTMLDivElement>(null);
  const volEl   = useRef<HTMLDivElement>(null);
  const rsiEl   = useRef<HTMLDivElement>(null);
  const macdEl  = useRef<HTMLDivElement>(null);
  const charts  = useRef<IChartApi[]>([]);

  const build = useCallback(() => {
    charts.current.forEach((c) => c.remove());
    charts.current = [];
    if (!priceEl.current || candles.length === 0) return;

    const showVol  = mode === "pro" && !!indicators.volume;
    const showRsi  = mode === "pro" && !!indicators.rsi;
    const showMacd = mode === "pro" && !!indicators.macd;
    const pH = Math.max(height - (showVol ? 90 : 0) - (showRsi ? 100 : 0) - (showMacd ? 110 : 0), 200);

    // ── Price pane ──────────────────────────────────
    const pc = createChart(priceEl.current, baseOpts(pH));
    charts.current.push(pc);

    if (mode === "simple") {
      const ls = pc.addSeries(LineSeries, { color: T.up, lineWidth: 2, priceLineVisible: false });
      ls.setData(candles.map((c) => ({ time: c.time, value: c.close })));
    } else {
      const cs = pc.addSeries(CandlestickSeries, {
        upColor: T.up, downColor: T.down, borderVisible: false,
        wickUpColor: T.up, wickDownColor: T.down,
      });
      cs.setData(candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    }

    const addLine = (data: Array<{ time: string; value: number }>, color: string, width: 1|2|3 = 1) => {
      if (!data.length) return;
      pc.addSeries(LineSeries, { color, lineWidth: width, priceLineVisible: false, crosshairMarkerVisible: false }).setData(data);
    };

    if (indicators.sma20)  addLine(valid(candles, "sma20"),  T.sma20,  1);
    if (indicators.sma50)  addLine(valid(candles, "sma50"),  T.sma50,  1);
    if (indicators.sma200) addLine(valid(candles, "sma200"), T.sma200, 2);
    if (indicators.ema20)  addLine(valid(candles, "ema20"),  T.ema20,  1);
    if (indicators.bb && mode === "pro") {
      [["bbUpper", T.bb], ["bbMid", T.bb], ["bbLower", T.bb]].forEach(([k, c]) =>
        addLine(valid(candles, k as keyof Candle), c as string, 1)
      );
    }
    pc.timeScale().fitContent();

    const sync = (src: IChartApi, ...targets: IChartApi[]) =>
      src.timeScale().subscribeVisibleLogicalRangeChange((r) => {
        if (r) targets.forEach((t) => t.timeScale().setVisibleLogicalRange(r));
      });

    // ── Volume pane ─────────────────────────────────
    if (showVol && volEl.current) {
      const vc = createChart(volEl.current, {
        ...baseOpts(90),
        rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0 }, borderColor: T.border },
        timeScale: { visible: false, borderColor: T.border },
      });
      charts.current.push(vc);
      vc.addSeries(HistogramSeries, { priceScaleId: "right", priceFormat: { type: "volume" } }).setData(
        candles.filter((c) => c.volume != null).map((c, i) => ({
          time: c.time, value: c.volume ?? 0,
          color: i > 0 && c.close < candles[i - 1].close ? T.volDown : T.volUp,
        }))
      );
      vc.timeScale().fitContent();
      sync(pc, vc); sync(vc, pc);
    }

    // ── RSI pane ────────────────────────────────────
    if (showRsi && rsiEl.current) {
      const rc = createChart(rsiEl.current, {
        ...baseOpts(100),
        rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.1 }, borderColor: T.border },
        timeScale: { visible: false, borderColor: T.border },
      });
      charts.current.push(rc);
      rc.addSeries(LineSeries, { color: T.rsi, lineWidth: 1, priceLineVisible: false }).setData(valid(candles, "rsi"));
      const dates = valid(candles, "rsi").map((p) => p.time);
      if (dates.length > 1) {
        const ob = rc.addSeries(LineSeries, { color: "#4A1F1F", lineWidth: 1, lineStyle: 2 as 0|1|2|3|4, priceLineVisible: false });
        const os = rc.addSeries(LineSeries, { color: "#1F4636", lineWidth: 1, lineStyle: 2 as 0|1|2|3|4, priceLineVisible: false });
        ob.setData([{ time: dates[0], value: 70 }, { time: dates[dates.length - 1], value: 70 }]);
        os.setData([{ time: dates[0], value: 30 }, { time: dates[dates.length - 1], value: 30 }]);
      }
      rc.timeScale().fitContent();
      sync(pc, rc); sync(rc, pc);
    }

    // ── MACD pane ───────────────────────────────────
    if (showMacd && macdEl.current) {
      const mc = createChart(macdEl.current, {
        ...baseOpts(110),
        rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0.1 }, borderColor: T.border },
        timeScale: { visible: true, borderColor: T.border },
      });
      charts.current.push(mc);
      mc.addSeries(HistogramSeries, { priceScaleId: "right" }).setData(
        candles.filter((c) => c.macdHist != null).map((c) => ({
          time: c.time, value: c.macdHist ?? 0,
          color: (c.macdHist ?? 0) >= 0 ? T.macdPos : T.macdNeg,
        }))
      );
      mc.addSeries(LineSeries, { color: T.rsi, lineWidth: 1, priceLineVisible: false }).setData(valid(candles, "macd"));
      mc.addSeries(LineSeries, { color: T.macdSig, lineWidth: 1, priceLineVisible: false }).setData(valid(candles, "macdSig"));
      mc.timeScale().fitContent();
      sync(pc, mc); sync(mc, pc);
    }

    // Auto-resize
    const ro = new ResizeObserver(() => {
      if (priceEl.current) pc.resize(priceEl.current.offsetWidth, pH);
    });
    if (priceEl.current) ro.observe(priceEl.current);
    return () => ro.disconnect();
  }, [candles, mode, indicators, height]);

  useEffect(() => {
    const cleanup = build();
    return () => { cleanup?.(); charts.current.forEach((c) => c.remove()); charts.current = []; };
  }, [build]);

  return (
    <div className="w-full overflow-hidden">
      <div ref={priceEl} className="w-full" />
      {mode === "pro" && indicators.volume && <div ref={volEl}  className="w-full border-t border-line" />}
      {mode === "pro" && indicators.rsi    && <div ref={rsiEl}  className="w-full border-t border-line" />}
      {mode === "pro" && indicators.macd   && <div ref={macdEl} className="w-full border-t border-line" />}
    </div>
  );
}
