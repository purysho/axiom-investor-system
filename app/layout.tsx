import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Footer, Nav, PageReveal } from "@/components/chrome";
import GateBand from "@/components/gate-band";
import { WorkflowBar } from "@/components/workflow";
import { ToastContainer } from "@/components/toast";
import { SyncBoot } from "@/components/sync";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Axiom Investor System", template: "%s · Axiom" },
  description: "Risk first, candidates second. Daily check, risk gate, journal, portfolio, and monthly review.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#F7F4EF" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
          <Nav />
          <div className="flex-1 min-w-0 px-4 pb-4 pt-5 md:px-8 md:pt-8">
            <SyncBoot />
            <GateBand />
            <WorkflowBar />
            <main>
              <PageReveal>{children}</PageReveal>
            </main>
            <Footer />
          </div>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
