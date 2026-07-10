/**
 * End-to-end smoke test against a RUNNING server — the signed-in journey a
 * new user takes: join with an invite → sync state → connect the built-in
 * simulator → dry-run the bot → read back status, runs, and the order log.
 *
 * Run it:
 *   1. Start a server on a FRESH database, e.g.:
 *        DATA_DIR=/tmp/axiom-e2e SESSION_SECRET=e2e-secret-anything npm start
 *   2. AXIOM_E2E_BASE=http://localhost:3000 npm run e2e
 *
 * The bootstrap invite code is read from AXIOM_E2E_INVITE, or discovered by
 * grepping the server log file named in AXIOM_E2E_LOG.
 *
 * No dependencies — plain Node 18+ fetch with a manual cookie jar. Exits 0
 * on success, 1 with a readable failure otherwise. Not wired into CI on
 * purpose: it needs a live server and (for full value) outbound market data.
 */

const BASE = process.env.AXIOM_E2E_BASE ?? "http://localhost:3199";
const STAMP = Date.now().toString(36);
const USER = `e2e_${STAMP}`;
const PASS = `e2e-pass-${STAMP}`;

let cookies = {};
function cookieHeader() {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) cookies[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
}
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  storeCookies(res);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

async function findInvite() {
  if (process.env.AXIOM_E2E_INVITE) return process.env.AXIOM_E2E_INVITE;
  const log = process.env.AXIOM_E2E_LOG;
  if (log) {
    const { readFileSync } = await import("node:fs");
    const m = readFileSync(log, "utf8").match(/invite code is: (AXIOM-[A-F0-9]+)/);
    if (m) return m[1];
  }
  return null;
}

// ── The journey ────────────────────────────────────────────────────────────

const health = await call("GET", "/api/health");
check("server is up (/api/health)", health.status === 200, `status ${health.status}`);

const invite = await findInvite();
check("bootstrap invite discovered", Boolean(invite), "set AXIOM_E2E_INVITE or AXIOM_E2E_LOG");
if (!invite || failures) process.exit(1);

const join = await call("POST", "/api/auth/join", {
  invite, username: USER, displayName: "E2E Smoke", passphrase: PASS,
});
check("join creates an account and a session", join.status === 200 && Boolean(cookies.axiom_session), JSON.stringify(join.json));

const put = await call("PUT", "/api/state", {
  data: {
    settings: {
      portfolioValue: 100_000, benchmarkName: "S&P 500", benchmarkSymbol: "spy.us",
      thresholds: { vixMax: 25, nfciMax: 0.5, maxDrawdownPct: 10, openRiskBudgetPct: 2 },
      riskPerTradePct: 0.5, heatCapPct: 6, notionalCapPct: 20,
    },
    gateInputs: { benchAbove200dma: true, vix: 15, nfci: -0.5, drawdownPct: 0, binaryEventRisk: false },
    dailyChecks: {}, trades: [], holdings: [], watchRules: [],
    watchData: { rows: [], asOf: "", source: "" },
    monthly: [], weeklyReviews: [], recommendations: [],
    protections: {}, copilot: { killSwitch: false },
  },
  baseUpdatedAt: null, force: true,
});
check("state sync accepts a baseline (PUT /api/state)", put.status === 200, JSON.stringify(put.json));

const sim = await call("POST", "/api/broker/connect", { mode: "sim" });
check("simulator connects with zero keys", sim.status === 200 && sim.json?.broker === "sim", JSON.stringify(sim.json));
check("simulator starts at $10,000", sim.json?.account?.equity === 10_000, `equity ${sim.json?.account?.equity}`);

const status = await call("GET", "/api/broker/status");
check("broker status reports the sim account", status.status === 200 && status.json?.connected === true && status.json?.broker === "sim", JSON.stringify(status.json)?.slice(0, 200));
check("sim account equity readable", status.json?.account?.equity === 10_000, `equity ${status.json?.account?.equity}`);
check("sim is paper mode", status.json?.mode === "paper", `mode ${status.json?.mode}`);

const setUniverse = await call("POST", "/api/bot", { universe: ["SPY", "AAPL"] });
check("bot universe saves", setUniverse.status === 200, JSON.stringify(setUniverse.json));

const dry = await call("POST", "/api/bot/run", { dryRun: true });
check("bot dry run returns a structured report", dry.status === 200 && typeof dry.json?.report?.outcome === "string", JSON.stringify(dry.json)?.slice(0, 200));
if (dry.json?.report) {
  const r = dry.json.report;
  console.log(`  ↳ outcome: ${r.outcome} — ${r.summary}`);
  check("dry run walked the interlocks", Array.isArray(r.checks) && r.checks.length >= 3, `${r.checks?.length ?? 0} checks`);
  check("dry run submitted nothing", (r.orders ?? []).every((o) => o.status === "dry-run" || o.status === "blocked"), JSON.stringify(r.orders));
}

const botStatus = await call("GET", "/api/bot");
check("run history recorded the dry run", botStatus.status === 200 && (botStatus.json?.runs?.length ?? 0) >= 1, `${botStatus.json?.runs?.length ?? 0} runs`);

const orders = await call("GET", "/api/broker/orders");
check("order log readable (and empty — nothing was submitted)", orders.status === 200 && Array.isArray(orders.json?.orders) && orders.json.orders.length === 0, JSON.stringify(orders.json)?.slice(0, 120));

const enable = await call("POST", "/api/bot", { enabled: true });
check("bot can be enabled on the sim (paper) broker", enable.status === 200 && enable.json?.settings?.enabled === true, JSON.stringify(enable.json));

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
