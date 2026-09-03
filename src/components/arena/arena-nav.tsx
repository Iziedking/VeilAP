import Link from "next/link";

import { ArenaThemeToggle } from "@/components/arena/arena-theme-toggle";
import { VeilLogo } from "@/components/veil-logo";

export function ArenaNav({ backHref = "/", backLabel = "Home" }: { backHref?: string; backLabel?: string }) {
  return (
    <header className="hub-nav">
      <Link className="hub-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
      <Link className="hub-back-link" href={backHref}>← {backLabel}</Link>
      <nav aria-label="Main navigation">
        <Link href="/arena">Arena</Link>
        <Link href="/champion">Champion</Link>
        <Link href="/play">Enter</Link>
        <Link href="/arena-console">Host</Link>
        <Link href="/profile">Profile</Link>
      </nav>
      <div className="hub-nav-actions">
        <ArenaThemeToggle />
        <Link className="hub-sign-in" href="/profile">Your account</Link>
      </div>
    </header>
  );
}
