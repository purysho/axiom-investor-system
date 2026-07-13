"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Bot, ChevronDown, KeyRound, LifeBuoy, Search, ShieldCheck,
  Wallet, Wrench, type LucideIcon,
} from "lucide-react";

/**
 * Product help — distinct from /guides, which teaches the investing method.
 * This answers "how do I use the software": connecting a broker, why the bot
 * won't start, recovering an account, fixing data. Client-side searchable so a
 * stuck user finds the one answer they need without scrolling every section.
 */

interface Faq { q: string; keywords: string; a: React.ReactNode }
interface Group { id: string; title: string; blurb: string; Icon: LucideIcon; faqs: Faq[] }

const GROUPS: Group[] = [
  {
    id: "broker", title: "Connecting a broker", Icon: Wallet,
    blurb: "Give AXIOM somewhere to place and track paper orders. No real money and no tax paperwork are required to start.",
    faqs: [
      {
        q: "Which should I connect — the built-in simulator or Alpaca?",
        keywords: "simulator alpaca broker connect choose start",
        a: <><p>Either works, and both are 100% paper (fake money). Pick based on how much setup you want:</p>
          <ul><li><strong>Built-in simulator</strong> — one click, no account, no API keys, no signup. Starts with a $10,000 paper balance and fills orders against the same free daily-close data the backtester uses. Best if you just want to try AXIOM and the bot immediately.</li>
          <li><strong>Alpaca paper account</strong> — a free third-party account that trades fake money against real, live market data. More realistic fills and intraday prices, but you create the account and generate API keys first.</li></ul>
          <p>You can switch between them any time in <Link href="/settings" className="quiet-link">Settings → Broker</Link>.</p></>,
      },
      {
        q: "Do I have to upload tax or identity information?",
        keywords: "tax kyc identity ssn information upload paper",
        a: <><p><strong>No.</strong> The built-in simulator needs nothing at all. An Alpaca <em>paper</em> account needs only an email address — you skip the live-account application, so there is no KYC, no Social Security number, and no tax documents.</p>
          <p>Identity verification is only ever required if you separately apply for a <em>live</em> Alpaca account with real money, which AXIOM never asks you to do.</p></>,
      },
      {
        q: "Where do I find my Alpaca paper API keys?",
        keywords: "alpaca keys api key id secret paper find lost regenerate",
        a: <><p>Log in at <span className="text-ink">alpaca.markets</span>, then in the dashboard switch to <strong>Paper Trading</strong> (the toggle near the top). Open <strong>API Keys</strong> and generate a key pair.</p>
          <p>Paper key IDs start with <code>PK…</code>. Alpaca shows the <strong>secret exactly once</strong>, at generation. If you saved only the key ID and not the secret, no page will show the secret again — just click <strong>Regenerate</strong> and copy both values immediately. Paste them into <Link href="/settings" className="quiet-link">Settings → Broker → Alpaca</Link> and leave the mode on Paper.</p></>,
      },
      {
        q: "What is the difference between paper and live trading?",
        keywords: "paper live real money difference",
        a: <><p><strong>Paper</strong> trading uses fake money — nothing you do can cost or make real dollars. It is the correct way to learn the process, build a track record, and let the bot run.</p>
          <p><strong>Live</strong> trading uses real money. AXIOM keeps it double-locked: a deployment-level switch plus a typed confirmation for every order, and the bot refuses live accounts entirely. Treat live as something to earn after a proven paper record, not a setting to flip on day one.</p></>,
      },
      {
        q: "Is my broker secret safe?",
        keywords: "secret safe encrypted security key storage browser",
        a: <><p>Yes. Keys are verified against the broker before they are saved, then stored encrypted on the server. They are never sent back to your browser, and AXIOM's API permissions grant trading only — it cannot withdraw funds. If you ever suspect a leak, regenerate the pair at Alpaca; that instantly invalidates the old secret.</p></>,
      },
    ],
  },
  {
    id: "bot", title: "The AXIOM Bot", Icon: Bot,
    blurb: "The paper-only autopilot. It scans with the strategy engine you can backtest, sizes with your risk rules, and submits bracket orders behind every interlock.",
    faqs: [
      {
        q: "Why won't the bot turn on?",
        keywords: "bot enable turn on disabled won't start broker",
        a: <><p>The bot only runs on a connected <strong>paper</strong> broker, so the switch stays disabled until one exists. Check, in order:</p>
          <ul><li>You are signed in — the bot runs server-side under your account, not in the browser.</li>
          <li>A paper broker is connected in <Link href="/settings" className="quiet-link">Settings</Link> (the simulator counts).</li>
          <li>Your Alpaca connection is in <em>paper</em> mode — a live connection stands the bot down by design.</li></ul>
          <p>Once a paper broker is connected, the toggle on the <Link href="/bot" className="quiet-link">AXIOM Bot</Link> page becomes active.</p></>,
      },
      {
        q: "Can the bot lose real money?",
        keywords: "bot lose real money safe risk live",
        a: <><p>No. The paper-only rule is enforced in code, not a setting — a live broker connection disables the bot automatically. Every order it considers still passes the risk gate, your behavioural protections, deterministic position sizing, and the kill switch. The worst case is a losing <em>paper</em> trade, which is exactly what a track record is made of.</p></>,
      },
      {
        q: "What does a dry run do?",
        keywords: "dry run preview bot test simulate",
        a: <><p>A dry run walks every interlock and reports exactly what the bot <em>would</em> do — signals found, sizing, and which orders it would place — without submitting anything. It is the safe way to see the bot's reasoning before letting it trade paper. Use <strong>Dry run</strong> on the AXIOM Bot page any time.</p></>,
      },
      {
        q: "How do I schedule the bot to run automatically?",
        keywords: "schedule cron automatic bot tick token run",
        a: <><p>By default the bot only runs when you press <strong>Run now</strong>. To run it on a schedule, set a <code>BOT_CRON_TOKEN</code> in your deployment and call the tick endpoint from any scheduler (cron, GitHub Actions, a hosted cron service). Full setup is in <code>BOT.md</code> in the repository.</p></>,
      },
    ],
  },
  {
    id: "account", title: "Account & security", Icon: KeyRound,
    blurb: "AXIOM has no email reset by design, so your passphrase and recovery code are the keys to your data. Keep both safe.",
    faqs: [
      {
        q: "I forgot my passphrase.",
        keywords: "forgot passphrase password reset recovery code locked out",
        a: <><p>There is no email reset — that is deliberate, so no one can take over your account through your inbox. Use your <strong>recovery code</strong> at the <Link href="/reset" className="quiet-link">reset page</Link> to set a new passphrase.</p>
          <p>If you have lost both the passphrase and the recovery code, the data cannot be recovered. This is why exporting a backup (Settings) and saving the recovery code somewhere safe matters.</p></>,
      },
      {
        q: "How do I turn on two-factor authentication?",
        keywords: "2fa mfa two factor authentication totp authenticator security",
        a: <><p>Open <Link href="/settings" className="quiet-link">Settings → Account and sync</Link> and use the security panel to enable an authenticator app (TOTP). You scan a QR code with any authenticator, then confirm a code. Save the backup codes it gives you — they get you in if you lose the authenticator.</p></>,
      },
      {
        q: "How do I back up or move my data to another device?",
        keywords: "backup export import restore move device transfer json data",
        a: <><p>In <Link href="/settings" className="quiet-link">Settings → Backup and restore</Link>, download a backup — a single JSON file with your holdings, journal, reviews, and settings. On another device or browser, use <strong>Restore backup</strong> and pick that file. If you use an account, signing in also syncs your data across devices automatically.</p></>,
      },
      {
        q: "How do I delete everything?",
        keywords: "delete reset erase clear data account remove",
        a: <><p>Two levels: <strong>Reset AXIOM</strong> (Settings) clears the local holdings, trades, and reviews from this browser. <strong>Delete account</strong> (Settings → Account) permanently removes your account and all synced data from the server. Export a backup first if there is any chance you will want the data again — deletion is permanent.</p></>,
      },
    ],
  },
  {
    id: "trouble", title: "Data & troubleshooting", Icon: Wrench,
    blurb: "Common quirks and how to resolve them. Most come down to the free, delayed data feed or a broker sync that hasn't run yet.",
    faqs: [
      {
        q: "The prices look wrong or delayed.",
        keywords: "prices wrong delayed data stale quotes feed eod",
        a: <><p>AXIOM's free market data is end-of-day and can lag, especially outside US market hours or for less-liquid symbols. It is fine for the process — daily checks, sizing, backtests — but it is not a real-time trading terminal. Alpaca paper mode gives more current prices than the built-in simulator if intraday accuracy matters to you.</p></>,
      },
      {
        q: "A trade shows as open but I closed it at the broker.",
        keywords: "trade open closed broker sync reconcile bracket stop position",
        a: <><p>When a bracket's stop or target fills at the broker, the journal doesn't hear about it instantly. Open <Link href="/settings" className="quiet-link">Settings → Broker</Link> and press <strong>Sync orders</strong> — AXIOM reconciles filled bracket legs and closes the matching journal trades. The bot also reconciles at the start of every run.</p></>,
      },
      {
        q: "A symbol has no chart or backtest data.",
        keywords: "no data missing symbol chart backtest ticker unsupported",
        a: <><p>The free feed covers most US equities and ETFs but not every ticker, and it does not cover commodities. If a symbol returns no data, check the ticker spelling, try its primary US listing, or pick a more liquid proxy. The backtester lists any symbols it couldn't fetch under the results.</p></>,
      },
      {
        q: "The site says I'm offline or not signed in.",
        keywords: "offline signed out session expired login sync 401",
        a: <><p>Sessions expire for security. If server features (broker, bot, sync) stop responding, sign in again from the <Link href="/login" className="quiet-link">login page</Link>. Your local data stays in the browser meanwhile; signing back in resumes syncing.</p></>,
      },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.faqs.map((f) => ({ ...f, groupId: g.id, groupTitle: g.title })));

export default function HelpPage() {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return null;
    return ALL.filter((f) =>
      f.q.toLowerCase().includes(q) || f.keywords.includes(q) || f.keywords.split(" ").some((k) => k.startsWith(q)),
    );
  }, [q]);

  return (
    <div>
      <section className="mb-10 rounded-[26px] bg-panel p-6 sm:p-9">
        <LifeBuoy size={25} className="text-faint" />
        <h2 className="mt-5 max-w-3xl font-display text-[1.55rem] font-semibold leading-[1.04] tracking-[-0.04em] sm:text-[2rem]">Help &amp; support</h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-mut">Practical answers for using the software — connecting a broker, the bot, your account, and fixing data. Looking for the <em>investing</em> method instead? That lives in <Link href="/guides" className="quiet-link">Learn</Link>.</p>

        <div className="mt-6 flex max-w-lg items-center gap-2 rounded-[16px] bg-bg px-4 py-3 ring-1 ring-[#27312B] focus-within:ring-[#B4F03C]">
          <Search size={17} className="shrink-0 text-faint" />
          <input
            className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
            placeholder="Search help — e.g. 'alpaca keys', 'bot won't start', 'forgot passphrase'"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search help articles"
          />
        </div>
      </section>

      {matches ? (
        <section>
          <div className="mb-5 page-kicker">{matches.length} result{matches.length === 1 ? "" : "s"} for “{query.trim()}”</div>
          {matches.length === 0 ? (
            <div className="rounded-[22px] bg-panel p-6 text-[15px] leading-relaxed text-mut">
              <p>No answer matched that. Try a shorter keyword, or reach out below — the <Link href="/guides" className="quiet-link">Learn</Link> section covers the investing method if that is what you were after.</p>
            </div>
          ) : (
            <div className="divide-y divide-line border-y border-line">
              {matches.map((f) => <FaqRow key={f.q} faq={f} tag={f.groupTitle} defaultOpen={matches.length <= 3} />)}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Quick start */}
          <section className="mb-12">
            <div className="page-kicker">First five minutes</div>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-[-0.035em]">Get running quickly</h2>
            <div className="mt-6 grid gap-7 md:grid-cols-3">
              {[
                ["1", "Set your rules", "Enter your portfolio value and risk limits so AXIOM can turn percentages into dollar risk.", "/settings", "Open Settings"],
                ["2", "Connect a paper broker", "One-click built-in simulator, or an Alpaca paper account. No real money, no tax paperwork.", "/settings", "Connect a broker"],
                ["3", "Try the bot with a dry run", "Watch the autopilot walk every interlock and show what it would trade — nothing is submitted.", "/bot", "Open the bot"],
              ].map(([n, title, text, href, cta]) => (
                <div key={n} className="border-t border-line pt-5">
                  <div className="text-sm font-bold text-[#a16b4c]">{n}</div>
                  <h3 className="mt-3 font-display text-2xl font-semibold tracking-[-0.025em]">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-mut">{text}</p>
                  <Link href={href} className="quiet-link mt-3">{cta} <ArrowRight size={14} /></Link>
                </div>
              ))}
            </div>
          </section>

          {GROUPS.map((g) => (
            <section key={g.id} id={g.id} className="mb-11 scroll-mt-28">
              <div className="mb-4 flex items-start gap-3">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-faint"><g.Icon size={19} /></span>
                <div>
                  <h2 className="font-display text-[1.7rem] font-semibold tracking-[-0.03em]">{g.title}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-mut">{g.blurb}</p>
                </div>
              </div>
              <div className="divide-y divide-line border-y border-line">
                {g.faqs.map((f) => <FaqRow key={f.q} faq={f} />)}
              </div>
            </section>
          ))}
        </>
      )}

      {/* Still stuck */}
      <section className="mt-12 rounded-[24px] bg-panel2/76 p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <ShieldCheck size={21} className="mt-1 shrink-0 text-[#a16b4c]" />
          <div>
            <div className="font-semibold text-ink">Still stuck?</div>
            <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-mut">
              If something is broken rather than confusing, open an issue on the project repository with what you did and what you expected — that is the fastest way to get it fixed. For a refresher on the method itself, the <Link href="/guides" className="quiet-link">Learn</Link> section walks through the whole routine.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a className="btn-primary" href="https://github.com/purysho/axiom-investor-system/issues" target="_blank" rel="noopener noreferrer">Report an issue <ArrowRight size={15} /></a>
              <Link className="btn" href="/guides">Read the method</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function FaqRow({ faq, tag, defaultOpen }: { faq: Faq; tag?: string; defaultOpen?: boolean }) {
  return (
    <details className="group scroll-mt-28" open={defaultOpen}>
      <summary className="grid cursor-pointer list-none gap-3 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          {tag && <div className="mb-1 text-xs font-semibold text-[#a16b4c]">{tag}</div>}
          <h3 className="font-display text-[1.2rem] font-semibold leading-snug tracking-[-0.02em] text-ink">{faq.q}</h3>
        </div>
        <span className="flex items-center gap-1 text-sm font-semibold text-faint"><ChevronDown size={16} className="transition-transform group-open:rotate-180" /></span>
      </summary>
      <div className="mb-5 max-w-3xl space-y-3 text-[15px] leading-relaxed text-mut [&_a]:underline [&_code]:rounded [&_code]:bg-bg [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-ink [&_li]:ml-1 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {faq.a}
      </div>
    </details>
  );
}
