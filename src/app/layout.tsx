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
    "Deterministic AI agents compete with sealed strategies, verifiable results, and private STRK20 prizes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${arenaDisplay.variable} ${arenaMono.variable}`} suppressHydrationWarning>
      <body>
        <Script id="veil-loader-init" strategy="beforeInteractive">
          {`document.documentElement.classList.add("has-js", "is-loading");`}
        </Script>
        <VeilEntryLoader />
        {children}
      </body>
    </html>
  );
}
