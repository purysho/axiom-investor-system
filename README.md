# Axiom Investor System — Web

Risk first, candidates second. The web surface of Axiom: a 15-minute daily market
check, weekly long-term portfolio review, a six-check swing Risk Gate, a closed-loop trade journal, and a
monthly performance-and-rules review — one discipline engine behind them all.

Built per `ARCHITECTURE_BLUEPRINT.md` (Phases 0–1). Stack: Next.js 15 · React 19 · TypeScript · Tailwind,
plus `@libsql/client` (SQLite file locally, Turso when hosted) and `jose` (cookie sessions). Invite-only
accounts, cross-device sync with conflict detection, an opt-in group view, in-app guides, and an installable
PWA are all included — one deployable site.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Optional: copy `.env.local.example` → `.env.local` and add a free Alpha Vantage key as a benchmark-quote
fallback. Without any keys, the app fetches VIX and NFCI from FRED and the benchmark's 200-day MA from Stooq
(all keyless, delayed, EOD) — and everything can also be entered manually.

## What v0 includes

- **Gate Band** (every page): the six-check gate — benchmark vs 200-DMA, VIX ≤ 25, NFCI ≤ +0.50, drawdown
  ≥ −10%, open planned risk ≤ 2%, no unaccepted binary events — with RISK ALLOWED / REDUCED RISK ONLY /
  NO NEW SWINGS recoloring the whole interface. Unknown inputs count as fails ("awaiting data").
- **/daily** — the five timed blocks with a 15:00 countdown; the candidates block physically locks when the
  gate says NO NEW SWINGS; saves the required "Today's permitted action is ___ because ___" line.
- **/gate** — inputs (fetch-latest or manual), editable governance thresholds, and the size-from-risk
  calculator with single-name cap and the liability-gap example.
- **/journal** — gate-stamped entries (a documented exception is required when the gate isn't open), the
  24-hour close-trade debrief (R, MFE/MAE, exit reason, mistake tag, one falsifiable lesson), expectancy /
  profit factor / adherence / leak-flag statistics, and CSV export/import in the trading-and-portfolio
  companion's exact 16-column ledger format.
- **/portfolio** — holdings ledger with computed weights, drift, forward income, concentration, and fee drag;
  the seven-step weekly review with the ≤3-actions rule; export in the companion's portfolio ledger format.
- **/watchlist** — tickerbot's rules ledger (`ticker,metric,op,value,note`) and on-demand alert digest. Facts,
  never directives; honest that nothing runs while you're away.
- **/monthly** — flow-adjusted return vs benchmark, the four diagnosis prompts, and the one-rule-change record
  (old rule → evidence → new rule → expected behavior → review date).

## Deploy

One container + one volume. Full guide with three paths (VPS+Caddy, Fly.io, Vercel+Turso) in `DEPLOY.md`;
shortest version:

```bash
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d --build
docker compose logs web | grep AXIOM-   # first-run invite code
```

## Data & storage

Local-first with sync on top: every page reads the typed localStorage store (`lib/store.ts`); when signed in,
a sync layer (`lib/sync.ts`) mirrors it to the server with optimistic-concurrency conflict handling. First run
on an empty database prints a bootstrap invite code to the server log — open `/join` with it. "Continue
offline" on the sign-in page runs the whole app in-browser with no account. Price refresh covers stocks/ETFs (AAPL), spot gold/silver (XAUUSD/XAGUSD), major crypto pairs (BTCUSD, ETHUSD, SOLUSD…), and international listings via Stooq suffixes (VUSA.UK) — one batch endpoint, all delayed EOD. Market data otherwise is
free-tier and delayed by design — the system runs on end-of-day cadence, values are timestamped and sourced,
and manual entry is always available.

## Not advice

Educational process tool. No signals, no probabilities, no order execution. Planned stop risk is not a
guaranteed maximum loss. Verify figures before acting.
