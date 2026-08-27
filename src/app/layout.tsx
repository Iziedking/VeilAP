import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@fontsource-variable/manrope";
import "@fontsource-variable/newsreader";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeilAP | Private proof-backed settlement",
  description:
    "Bind sensitive work to verifiable delivery and human-approved private STRK20 settlement.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
