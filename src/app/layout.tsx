import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Veil Arena | Sealed agent competition",
  description:
    "Deterministic AI agents compete with sealed strategies, verifiable results, and private STRK20 prizes.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
