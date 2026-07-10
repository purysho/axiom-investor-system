import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Footer, Nav, PageContextHeader, PageReveal } from "@/components/chrome";
import { ToastContainer } from "@/components/toast";
import AssistantWidget from "@/components/assistant";
import { SyncBoot } from "@/components/sync";
import "./fonts.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "AXIOM Investor System", template: "%s · AXIOM" },
  description: "A calm, guided investing process for portfolio review, risk control, swing decisions and learning.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0B0F0D" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      {/* Fonts are self-hosted (app/fonts.css + public/fonts) — no third-party
          requests, no Google Fonts dependency, and the CSP can stay 'self'. */}
      <body>
        <Nav />
        <SyncBoot />
        <div className="site-shell">
          <main>
            <PageContextHeader />
            <PageReveal>{children}</PageReveal>
          </main>
          <Footer />
        </div>
        <AssistantWidget />
        <ToastContainer />
      </body>
    </html>
  );
}
