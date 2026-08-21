import Link from "next/link";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <div className="eyebrow text-volt">What we store and where it goes</div>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Privacy note</h1>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-mut">
        <p><span className="font-semibold text-ink">What's stored.</span> Your username, display name, hashed passphrase and hashed recovery code, and — when signed in — your synced AXIOM data (settings, journal, portfolio, watchlist, reviews, Copilot records). It lives in the app's own database. In offline mode nothing leaves your browser.</p>
        <p><span className="font-semibold text-ink">Broker keys.</span> If you connect a brokerage account, your API keys are stored encrypted on the server and are never sent back to any browser. They grant trading only — AXIOM cannot move money in or out. Disconnecting in Settings deletes them. The built-in simulator stores no keys at all.</p>
        <p><span className="font-semibold text-ink">What others see.</span> Nothing, unless you opt in. The Group page only lists members who turned on sharing, and shares process metrics only — never positions, tickers, or dollar amounts.</p>
        <p><span className="font-semibold text-ink">AI features.</span> When you use the assistant or the Copilot's AI analyst, your question plus a snapshot of your own AXIOM data is sent to Anthropic to generate the answer. Snapshots never include your passphrase, recovery code, or other members' data. Skip the AI features and nothing is sent.</p>
        <p><span className="font-semibold text-ink">Market data.</span> Price lookups query free public sources (Stooq, FRED) from the server; your identity isn't attached beyond ordinary web requests.</p>
        <p><span className="font-semibold text-ink">Cookies.</span> One session cookie to keep you signed in (or one flag cookie for offline mode). No ads, no trackers, no analytics. Fonts and all assets are served first-party — pages make no requests to third-party CDNs.</p>
        <p><span className="font-semibold text-ink">Your controls.</span> Export everything as JSON (Settings → Backup), regenerate your recovery code, or delete your account — deletion removes your account and synced data immediately and permanently.</p>
      </div>
      <p className="mt-10 text-sm text-faint">See also the <Link href="/terms" className="quiet-link">terms</Link> · <Link href="/login" className="quiet-link">back to AXIOM</Link></p>
    </div>
  );
}
