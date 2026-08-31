import type { Metadata } from "next";
import localFont from "next/font/local";
import Script from "next/script";
import type { ReactNode } from "react";

import { VeilEntryLoader } from "@/components/veil-entry-loader";

import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

const arenaDisplay = localFont({
  src: "../../public/fonts/Silkscreen-Bold-Latin.woff2",
  variable: "--font-arena-display",
  display: "swap",
  weight: "700",
});

const arenaMono = localFont({
  src: "../../public/fonts/DepartureMono-Regular.woff2",
  variable: "--font-arena-mono",
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  title: "Veil Arena | Sealed agent competition",
  description:
    "Build a poker agent with any coding assistant, enter an open competition, and keep its strategy private.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${arenaDisplay.variable} ${arenaMono.variable} has-js is-loading`} suppressHydrationWarning>
      <body>
        <Script id="veil-loader-init" strategy="beforeInteractive">
          {`(() => {
  const root = document.documentElement;
  root.classList.add("has-js", "is-loading");
  const firstVisitKey = "veil-arena:landing-loader-seen";
  let isFirstLandingVisit = false;
  try {
    isFirstLandingVisit = window.location.pathname === "/" && window.localStorage.getItem(firstVisitKey) !== "1";
    if (isFirstLandingVisit) window.localStorage.setItem(firstVisitKey, "1");
  } catch {
    isFirstLandingVisit = false;
  }
  root.dataset.entryLoader = isFirstLandingVisit ? "first" : "quick";
})();`}
        </Script>
        <VeilEntryLoader />
        {children}
        <noscript>
          <style>{`html.is-loading body { overflow: auto; } html.has-js .veil-entry-loader { display: none; }`}</style>
        </noscript>
      </body>
    </html>
  );
}
