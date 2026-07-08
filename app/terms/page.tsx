import Link from "next/link";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <div className="eyebrow text-[#B4F03C]">The deal, in plain English</div>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Terms of use</h1>
      <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-mut">
        <p><span className="font-semibold text-ink">Educational tool, not advice.</span> AXIOM is software that helps you follow your own investing process. Nothing here — pages, charts, the assistant, the Copilot — is investment advice, a recommendation, or a solicitation to buy or sell anything. The decisions and their consequences are yours.</p>
        <p><span className="font-semibold text-ink">Data can be wrong or late.</span> Market figures come from free, delayed, end-of-day sources and AI features can make mistakes. Verify anything before acting on it.</p>
        <p><span className="font-semibold text-ink">Paper only.</span> The Copilot proposes paper trades. AXIOM does not connect to a broker, hold funds, or execute real orders.</p>
        <p><span className="font-semibold text-ink">Your account.</span> Keep your passphrase and recovery code safe — there is no email reset. You can export your data (Settings) or delete your account at any time, and deletion is permanent.</p>
        <p><span className="font-semibold text-ink">No warranty.</span> The service is provided as-is, without warranties of any kind, and may change or pause at any time. To the maximum extent permitted by law, the operator isn't liable for losses arising from use of the service.</p>
        <p><span className="font-semibold text-ink">Fair use.</span> Don't abuse the service — no scraping, attacking, or attempting to access other people's data. Accounts doing so may be removed.</p>
      </div>
      <p className="mt-10 text-sm text-faint">See also the <Link href="/privacy" className="quiet-link">privacy note</Link> · <Link href="/login" className="quiet-link">back to AXIOM</Link></p>
    </div>
  );
}
