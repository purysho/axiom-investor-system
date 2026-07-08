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
