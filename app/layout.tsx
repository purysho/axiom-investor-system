import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Footer, Nav, PageReveal } from "@/components/chrome";
import GateBand from "@/components/gate-band";
import { WorkflowBar } from "@/components/workflow";
import { SyncBoot } from "@/components/sync";
import "./globals.css";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
  title: {
    default: "Axiom Investor System",
    template: "%s · Axiom",
  },
  description:
    "Risk first, candidates second. A 15-minute daily check, weekly portfolio review, gated swing candidates, closed-trade debriefs, and monthly rule review.",
};

export const viewport: Viewport = {
  themeColor: "#0A0D10",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
          <Nav />
          <div className="flex-1 px-3 pb-4 pt-3 md:px-5">
            <GateBand />
            <div className="mt-3"><WorkflowBar /></div>
            <main className="mt-0">
              <SyncBoot />
              <PageReveal>{children}</PageReveal>
            </main>
            <Footer />
          </div>
        </div>
      </body>
    </html>
  );
}
