# AXIOM Investor System — guided web app

AXIOM is a risk-first investing process for people who want a simple routine instead of a market dashboard.

The app guides a user through five recurring jobs:

1. check whether new swing risk is allowed;
2. look after the long-term portfolio on a schedule;
3. review trade ideas only when risk permits;
4. record and reflect on every closed trade;
5. compare results with a benchmark and test process changes once a month.

The main navigation is intentionally plain:

**Today · My portfolio · Copilot · Trade ideas · Journal · Review · Learn**

Risk Check, AXIOM Bot, Charts, Group, and Settings remain available under **More**.

## Run locally

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

For a production build:

```bash
npm run typecheck
npm run build
npm start
```

Optional: copy `.env.local.example` to `.env.local` and add the supported environment values. Without paid market-data keys, AXIOM can use delayed/keyless sources already wired into the app and also allows manual entry.

## How the beginner experience works

### Today

The home page starts with one plain-English answer and a short list of next steps. It does not lead with charts, market movers, or a wall of portfolio statistics.

A first-time user is invited to set starting rules or load the filled-in example.

### Daily check

`/daily` is a five-question guided routine. One question is shown at a time:

- Are today's risk conditions understood?
- Has the broad market picture meaningfully changed?
- Is there a known event that could change an existing risk?
- Does anything already owned need attention?
- Is candidate review allowed today?

The final task is one sentence: what is permitted today, and why?

### Risk check

`/gate` asks: **Can I take new swing risk today?**

The six underlying checks remain the same:

- benchmark trend versus its 200-day moving average;
- VIX ceiling;
- NFCI ceiling;
- personal portfolio drawdown limit;
- aggregate planned open swing risk;
- unaccepted binary-event risk.

The rules are shown as six beginner questions. Technical explanations are optional. The normal beginner input is limited to personal drawdown and unaccepted event risk; manual market inputs and governance thresholds are secondary disclosures.

Unknown inputs remain unresolved and are not treated as passes.

### My portfolio

`/portfolio` starts with a simple question: what do I own, and does anything need a decision?

The weekly review looks for drift, thesis concerns, payout-quality concerns, and a short action list. Holdings expand individually for editing instead of opening on a spreadsheet-like ledger.

### Trade ideas

`/watchlist` is presented as **Trade ideas**.

An idea needs one measurable reason to look again. Alerts state facts such as “review ABC if price reaches 52”; they do not issue buy or sell directives. Candidate discovery is intentionally discouraged when the risk check says no new swing trades.

### Journal

`/journal` prioritizes reflection before statistics.

Closed trades are described using process and outcome together:

- Skilled win
- Valid loss
- Lucky win
- Process loss

Incomplete closed-trade reflections can be reopened directly and completed with the existing exit details pre-filled. Expectancy, win rate, charts, and CSV tools are available later under **Patterns and statistics**.

### Monthly review

`/monthly` is a four-step conversation:

1. Compare the result with a benchmark.
2. Explain the gap in ordinary language.
3. Look for a repeated process problem.
4. Decide whether one rule deserves a controlled test.

The app deliberately discourages rewriting rules because of one painful loss or one lucky streak.

### Copilot, backtesting, and the AXIOM bot

`/copilot` scans your trade-idea tickers and proposes paper trades with evidence; a deterministic
validator (gate, protections, sizing, heat cap) decides what is approvable, and you approve each one.

`/bot` is the autopilot. It runs the same pipeline on a schedule and submits **paper** bracket
orders only — a live broker connection stands it down, in code. The page also backtests the exact
strategy code the bot trades over up to ten years of daily history, with conservative fills.
Architecture, interlocks, and scheduling live in `BOT.md`.

### Learn

`/guides` is a short learning path rather than a reference manual. Seven expandable lessons answer the questions a beginner reaches in the order they use AXIOM.

### Starting rules and practical controls

`/settings` begins with three setup steps:

1. portfolio value and long-term benchmark;
2. planned risk for one swing trade;
3. single-position and total swing concentration ceilings.

Account, sync, backup, example data, and reset controls are kept in a secondary **Practical stuff** section.

## Data and storage

AXIOM is local-first with optional account sync.

The browser store is defined in `lib/store.ts`. When signed in, `lib/sync.ts` mirrors state to the server with conflict handling. Offline mode runs the investing process in the browser without an account.

The application includes invite-only account flows, API routes, delayed market-data integrations, backup/restore, CSV journal tools, group features, and PWA support.

See `DEPLOY.md` for deployment options.

## Design notes

See `MAKEOVER_NOTES.md` for the guided-site redesign rationale and the production validation performed for this build.

Preview renders are in `design-previews/`.

## Important limitation

AXIOM is an educational process tool, not investment advice and not an order-execution system. It does not provide probabilities or guaranteed trade outcomes. Market figures may be delayed. Planned stop risk is not a guaranteed maximum loss; gaps and execution conditions can produce larger losses.
