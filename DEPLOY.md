# Deploying Axiom Investor System

## The decision

Build as a self-contained Next.js standalone bundle inside a multi-stage Docker image; deploy as **one
container plus one mounted volume** holding the SQLite file. That is the whole system — app, accounts, sync,
group, and database in a single ~$0–5/month artifact with no third-party data dependency. The code also runs
unchanged on **Vercel + Turso** (set two env vars) if you'd rather have a managed, serverless setup.

Two facts shape everything below:

- **HTTPS is required for real use.** Session cookies are `Secure` in production and the PWA only installs
  over HTTPS. Every path here gives you TLS; don't run plain `http://` beyond localhost.
- **The first-run invite prints to the server log.** On an empty database, the first request that touches it
  (the `/api/health` probe does this deliberately) creates the schema and logs
  `[Axiom] First run — your invite code is: AXIOM-XXXXXXXX`. Open `/join` with that code to create the first
  account; after that, mint invites from the Group page.

Set `SESSION_SECRET` everywhere (generate with `openssl rand -hex 32`). Without it the app falls back to a
built-in dev secret and warns loudly.

---

## Path A — Docker on a VPS (primary)

Any box with Docker (Hetzner/DigitalOcean/etc., smallest tier is plenty):

```bash
git clone <your-repo> axiom && cd axiom          # or scp the project up
echo "SESSION_SECRET=$(openssl rand -hex 32)" > .env
docker compose up -d --build
docker compose logs web | grep AXIOM-            # ← first invite code
```

The app listens on `:3000`; data lives in the `axiom-data` volume. For TLS, put Caddy in front — it
auto-provisions Let's Encrypt certificates from two lines. On the host:

```bash
sudo apt install caddy   # or the docker caddy image
```

`/etc/caddy/Caddyfile`:

```
axiom.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

`sudo systemctl reload caddy`, point DNS at the box, done.

**Updating:** pull/copy the new code, `docker compose up -d --build`. The schema is `CREATE TABLE IF NOT
EXISTS`, so restarts and upgrades are safe against existing data.

**Backups:** the volume's single file is everything. `docker run --rm -v axiom-data:/data -v $PWD:/out
debian cp /data/axiom.db /out/axiom-$(date +%F).db` in a cron job is a complete backup strategy. Each member's
in-app JSON export (Settings → Backup) is an independent second layer.

## Path B — Fly.io (managed container, still your database)

```bash
fly launch --copy-config --no-deploy      # uses the included fly.toml; pick your app name
fly volumes create axiom_data --size 1
fly secrets set SESSION_SECRET=$(openssl rand -hex 32)
fly deploy
fly logs | grep AXIOM-                    # first invite code
```

`fly.toml` already wires the volume to `/data`, forces HTTPS, and health-checks `/api/health`. Keep it to a
single machine (`min_machines_running` 0/1) — one SQLite file means one writer; do not scale this horizontally.

## Path C — Vercel + Turso (serverless, managed database)

Serverless filesystems are ephemeral, so the SQLite file moves to Turso (a hosted libSQL service with a free
tier); the code switches automatically when the env vars exist.

```bash
turso db create axiom
turso db show axiom --url        # → TURSO_DATABASE_URL
turso db tokens create axiom     # → TURSO_AUTH_TOKEN
```

Import the repo in Vercel (or `vercel deploy`), set three env vars — `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `SESSION_SECRET` — and deploy. Then visit `https://<your-app>/api/health` once and read
the first invite from the function logs (Vercel → Deployments → Logs).

## No Docker at all

A plain Node 22 host works too:

```bash
npm ci && npm run build
DATA_DIR=/var/lib/axiom SESSION_SECRET=... npm start
```

Front it with Caddy as in path A. (The standalone/Docker route is still recommended — it pins the runtime.)

---

## The in-site assistant (optional)

The "Ask Axiom" bubble is powered by Claude via the Anthropic API. To turn it on:

1. Create an API key at console.anthropic.com (Settings → API keys) and add a few dollars of credit.
2. Add `ANTHROPIC_API_KEY` to your host's environment (Render → your service → Environment; or `fly secrets set`; or `.env` for Docker) and redeploy.

Costs are pay-per-use on Claude Haiku 4.5 ($1 per million input tokens, $5 per million output tokens) — a
typical question-and-answer is well under a cent. Each request sends the question plus a compact snapshot of
that user's own Axiom data (never other members' data, passphrases, or invite codes) to Anthropic. Without the
key, the assistant degrades to a friendly setup message; nothing else breaks.

## Security

- **`SESSION_SECRET` is mandatory in production.** The app now refuses to serve any request without it,
  because the previous dev fallback key is committed to this repo — a deployment missing the variable would
  have allowed forged session cookies. Generate 32+ random characters and set it in your host's environment.
- **Two-factor authentication** (TOTP, RFC 6238) is available per-account in Settings → Security. Seeds are
  encrypted at rest with AES-256-GCM. Eight single-use backup codes are issued at enrolment.
- **Account lockout**: 8 failed passphrase attempts locks an account for 15 minutes, counted server-side so
  it holds even when an attacker rotates IP addresses. Per-IP rate limits sit in front of that.
- **Session revocation**: passphrase changes, recovery resets, and "sign out everywhere" bump a token version
  that immediately invalidates every existing cookie.
- **Security headers**: CSP, HSTS (2 years, preload-eligible), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy`, and a restrictive `Permissions-Policy` are applied to every response.
- **CSRF**: state-changing API requests must be same-origin; cookies are `httpOnly`, `SameSite=Lax`, and
  `Secure` in production.
- **Audit trail**: sign-ins, failures, lockouts, 2FA changes, resets, and deletions are recorded and visible
  to each user in Settings → Security.
- **`ENCRYPTION_KEY`** is optional; when unset it is derived from `SESSION_SECRET`. Rotating `SESSION_SECRET`
  therefore invalidates stored 2FA seeds — users would re-enrol after resetting with a recovery code.

Rotate `SESSION_SECRET` if you ever suspect it leaked: every session dies, and 2FA enrolments will need
redoing unless you set an explicit `ENCRYPTION_KEY` first.

## Broker connection

Axiom can place real orders through **your own** broker account. Each user connects their own Alpaca API
keys in Settings; keys are verified against the broker before being stored, then encrypted at rest with
AES-256-GCM. Axiom never holds funds, never sees a bank card, and API keys grant trading — not withdrawals.

**Paper by default.** Live trading additionally requires `ALLOW_LIVE_TRADING=true` in the environment *and*
the user typing `PLACE LIVE ORDER` per order. Both. The UI cannot switch live mode on by itself.

Every order passes deterministic server-side checks before submission, in this order:

1. Risk gate — `NO NEW SWINGS` blocks all new risk, no exceptions
2. Live-trading flag and typed confirmation (live only)
3. Preflight against *live broker state*: account not restricted, market open, sufficient buying power,
   position within the concentration cap **measured on real broker equity**, planned risk under 5% of
   equity as a hard backstop, and a 5-orders-per-day discipline limit
4. Write-ahead: intent is recorded in `broker_orders` *before* submission
5. Idempotency: the client order id is derived from the recommendation, so resubmitting the same
   recommendation can never open a second position

Orders are submitted as **brackets** — entry, protective stop, and optional take-profit together. Axiom
does not submit unprotected orders.

If the network fails mid-submission the order is marked `pending`, never silently retried, and
**Sync orders** reconciles against the broker (the source of truth for fills). Intents the broker never
received are marked as such rather than assumed dead.

### Regulatory note

Trading your own account with your own credentials is not a regulated activity. Operating a service where
*other people* fund accounts or have deals arranged for them is: in the UK that engages the general
prohibition in s19 FSMA 2000, and permissions such as *arranging deals in investments* or *safeguarding
and administering investments*. Take specialist FCA advice before offering execution to anyone but yourself.

## Going public

By default `SIGNUPS_OPEN=true`: anyone who reaches `/join` can create an account. Set it to `false` to go back
to invite-only (the bootstrap invite is printed to the server log on first run; more can be minted in-app).

What is in place for public use: passphrases and recovery codes are scrypt-hashed, sessions are signed JWTs in
httpOnly cookies, sign-in / sign-up / reset / assistant / Copilot routes are rate-limited per IP, the Group page
only lists members who opted into sharing, and every account can export its data or delete itself permanently.

What is deliberately **not** in place, and you should know before inviting strangers:

- **No email address is collected**, so there is no email verification and no "email me a reset link". Recovery
  depends entirely on the one-time `AXR-XXXX-XXXX` code shown at sign-up. If a user loses their passphrase *and*
  that code, their synced data is unrecoverable. This is a deliberate trade (no email = less to leak); say so plainly.
- **No CAPTCHA.** Rate limiting is in-memory and per-instance — fine for one Render/Fly instance, useless behind
  multiple. If the app grows, put Cloudflare (or Turnstile) in front and move the limiter to the database.
- **No payment, no broker connection.** The Copilot is paper-only by design.

## Operational notes

- **One writer.** The file-backed setup is deliberately single-instance. If the group ever outgrows that,
  switch to path C — same code, zero migration beyond exporting/importing member backups.
- **Rotating `SESSION_SECRET`** signs everyone out (sessions are stateless JWTs). Data is unaffected.
- **Lost passphrase:** there is no reset by design; any member mints a fresh invite and the person rejoins
  under a new account, then restores their own JSON backup.
- **Market data** (FRED, Stooq) is fetched server-side, keyless and delayed; `ALPHA_VANTAGE_API_KEY` is an
  optional quote fallback. Outbound HTTPS from the host is all that's needed.
- **What to monitor:** `/api/health` (returns `{ok:true, storage:...}`) and disk space on the volume. That's
  the whole ops surface.
