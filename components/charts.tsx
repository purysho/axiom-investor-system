"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── shared tokens ──────────────────────────────────────────────────────────
const C = {
  allowed: "#2F6B52",
  reduced: "#A8732F",
  closed:  "#A84D45",
  steel:   "#93A39A",
  line:    "#DED7CA",
  mut:     "#68716B",
  faint:   "#979D96",
  ink:     "#1E2A24",
  bg:      "#FFFEFA",
};

const tooltipStyle = {
  backgroundColor: "#FFFEFA",
  border: `1px solid ${C.line}`,
  borderRadius: 14,
  fontSize: 12,
  fontFamily: "DM Sans, Inter, system-ui, sans-serif",
  color: C.ink,
  boxShadow: "0 12px 30px rgba(30,42,36,0.10)",
};

// ── Equity Curve ────────────────────────────────────────────────────────────
interface EquityPoint { date: string; r: number; cumR: number }

export function EquityCurve({ trades }: { trades: Array<{ exitDate?: string | null; entry: number | null; stop: number | null; shares: number | null; exitPrice?: number | null; fees?: number | null; status: string }> }) {
  const closed = trades
    .filter((t) => t.status === "Closed" && t.exitDate && t.entry !== null && t.stop !== null)
    .sort((a, b) => (a.exitDate! > b.exitDate! ? 1 : -1));

  if (closed.length < 2) {
    return <Empty label="Need at least 2 closed trades for the equity curve." />;
  }

  let cumR = 0;
  const points: EquityPoint[] = closed.map((t) => {
    const risk = Math.abs((t.entry ?? 0) - (t.stop ?? 0)) * (t.shares ?? 0);
    const gross = ((t.exitPrice ?? t.entry ?? 0) - (t.entry ?? 0)) * (t.shares ?? 0);
    const net = gross - (t.fees ?? 0);
    const r = risk > 0 ? net / risk : 0;
    cumR = Math.round((cumR + r) * 1000) / 1000;
    return { date: t.exitDate!.slice(5), r, cumR };
  });

  const min = Math.min(0, ...points.map((p) => p.cumR));
  const max = Math.max(0, ...points.map((p) => p.cumR));
  const color = points[points.length - 1].cumR >= 0 ? C.allowed : C.closed;

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[min - 0.5, max + 0.5]} tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}R`} width={36} />
        <ReferenceLine y={0} stroke={C.line} strokeDasharray="3 3" />
        <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${v > 0 ? "+" : ""}${v.toFixed(2)}R`, "Cumulative"]) as never} labelStyle={{ color: C.mut }} />
        <Area type="monotone" dataKey="cumR" stroke={color} strokeWidth={1.5} fill="url(#eq-grad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── R Distribution ──────────────────────────────────────────────────────────
export function RDistribution({ trades }: { trades: Array<{ status: string; entry: number | null; stop: number | null; shares: number | null; exitPrice?: number | null; fees?: number | null }> }) {
  const closed = trades.filter((t) => t.status === "Closed" && t.entry !== null && t.stop !== null);
  if (closed.length < 3) return <Empty label="Need 3+ closed trades for the distribution." />;

  const rs = closed.map((t) => {
    const risk = Math.abs((t.entry ?? 0) - (t.stop ?? 0)) * (t.shares ?? 0);
    const gross = ((t.exitPrice ?? t.entry ?? 0) - (t.entry ?? 0)) * (t.shares ?? 0);
    const net = gross - (t.fees ?? 0);
    return risk > 0 ? Math.round((net / risk) * 4) / 4 : 0;
  });

  const buckets = new Map<string, { label: string; val: number; wins: number; losses: number }>();
  for (let v = -4; v <= 6; v += 0.5) {
    const label = `${v >= 0 ? "+" : ""}${v}R`;
    buckets.set(label, { label, val: v, wins: 0, losses: 0 });
  }
  for (const r of rs) {
    const clamped = Math.max(-4, Math.min(6, r));
    const rounded = Math.round(clamped * 2) / 2;
    const label = `${rounded >= 0 ? "+" : ""}${rounded}R`;
    const b = buckets.get(label) ?? { label, val: rounded, wins: 0, losses: 0 };
    if (r >= 0) b.wins++; else b.losses++;
    buckets.set(label, b);
  }

  const data = [...buckets.values()].filter((b) => b.wins + b.losses > 0);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} interval={1} />
        <YAxis tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} allowDecimals={false} />
        <ReferenceLine x="+0R" stroke={C.line} strokeDasharray="3 3" />
        <Tooltip contentStyle={tooltipStyle} formatter={((v: number, _: string, props: { payload?: { label: string } }) => [v, props.payload?.label ?? ""]) as never} labelStyle={{ color: C.mut }} />
        <Bar dataKey="wins" stackId="a" radius={0}>
          {data.map((b, i) => <Cell key={i} fill={b.val >= 0 ? C.allowed : C.closed} fillOpacity={0.8} />)}
        </Bar>
        <Bar dataKey="losses" stackId="a" radius={0}>
          {data.map((_, i) => <Cell key={i} fill={C.closed} fillOpacity={0.4} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Monthly Returns ─────────────────────────────────────────────────────────
interface MonthlyReturn { month: string; ret: number | null; bench: number | null }

export function MonthlyReturnsChart({ monthly }: { monthly: Array<{ monthStart: string; startingValue: number | null; netContributions: number | null; endingValue: number | null; benchmarkReturnPct: number | null }> }) {
  if (monthly.length < 1) return <Empty label="No months recorded yet." />;

  const data: MonthlyReturn[] = monthly.map((m) => {
    const start = m.startingValue ?? 0;
    const net = m.netContributions ?? 0;
    const end = m.endingValue ?? 0;
    const denom = start + net;
    const ret = denom > 0 ? Math.round(((end - start - net) / denom) * 10000) / 100 : null;
    return { month: m.monthStart.slice(0, 7), ret, bench: m.benchmarkReturnPct };
  });

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
        <XAxis dataKey="month" tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <ReferenceLine y={0} stroke={C.line} />
        <Tooltip contentStyle={tooltipStyle} formatter={((v: number) => [`${v >= 0 ? "+" : ""}${v?.toFixed(2)}%`]) as never} labelStyle={{ color: C.mut }} />
        <Bar dataKey="ret" name="Portfolio" radius={0}>
          {data.map((d, i) => <Cell key={i} fill={(d.ret ?? 0) >= 0 ? C.allowed : C.closed} fillOpacity={0.85} />)}
        </Bar>
        <Bar dataKey="bench" name="Benchmark" fill={C.steel} fillOpacity={0.45} radius={0} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Allocation Donut ────────────────────────────────────────────────────────
const SLEEVE_COLORS: Record<string, string> = {
  Core: C.steel,
  Income: C.allowed,
  Satellite: C.reduced,
  Cash: C.mut,
};

export function AllocationDonut({ holdings }: { holdings: Array<{ sleeve: string; price: number | null; shares: number | null; ticker: string }> }) {
  const byS: Record<string, number> = {};
  for (const h of holdings) {
    if (h.price === null || h.shares === null) continue;
    byS[h.sleeve] = (byS[h.sleeve] ?? 0) + h.price * h.shares;
  }
  const data = Object.entries(byS).map(([name, value]) => ({ name, value }));
  if (data.length === 0) return <Empty label="Add priced holdings to see allocation." />;
  const total = data.reduce((a, b) => a + b.value, 0);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2} dataKey="value" strokeWidth={0}>
          {data.map((d, i) => <Cell key={i} fill={SLEEVE_COLORS[d.name] ?? C.faint} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={((v: number, name: string) => [`${((v / total) * 100).toFixed(1)}%`, name]) as never} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── Gate History ────────────────────────────────────────────────────────────
export function GateHistory({ checks }: { checks: Record<string, { gateState: string }> }) {
  const entries = Object.entries(checks).sort(([a], [b]) => a.localeCompare(b)).slice(-30);
  if (entries.length < 2) return <Empty label="Run the daily check for a few days to see gate history." />;

  const data = entries.map(([date, c]) => ({
    date: date.slice(5),
    state: c.gateState === "RISK ALLOWED" ? 2 : c.gateState === "REDUCED RISK ONLY" ? 1 : 0,
    label: c.gateState,
  }));

  const stateColor = (v: number) => v === 2 ? C.allowed : v === 1 ? C.reduced : C.closed;

  return (
    <ResponsiveContainer width="100%" height={80}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -32 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.faint, fontFamily: "IBM Plex Mono, monospace" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 2]} hide />
        <Tooltip contentStyle={tooltipStyle} formatter={((_: number, __: string, props: { payload?: { label: string } }) => [props.payload?.label ?? "", "Gate"]) as never} labelStyle={{ color: C.mut }} />
        <Bar dataKey="state" radius={0} maxBarSize={24}>
          {data.map((d, i) => <Cell key={i} fill={stateColor(d.state)} fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Sparkline (mini price history) ──────────────────────────────────────────
export function Sparkline({ data, color = C.steel }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`sp-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.2} fill={`url(#sp-${color.replace("#", "")})`} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function Empty({ label }: { label: string }) {
  return (
    <div className="flex h-28 items-center justify-center">
      <p className="font-mono text-[11px] text-faint">{label}</p>
    </div>
  );
}
