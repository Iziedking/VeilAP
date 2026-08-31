import Link from "next/link";

import { VeilLogo } from "@/components/veil-logo";

export function ArenaNav() {
  return (
    <header className="hub-nav">
      <Link className="hub-brand" href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
      <nav aria-label="Main navigation">
        <Link href="/arena">Arena</Link>
        <Link href="/champion">Champion</Link>
        <Link href="/play">Enter</Link>
        <Link href="/arena-console">Host</Link>
      </nav>
      <Link className="hub-sign-in" href="/sign-in">Wallet sign in</Link>
    </header>
  );
}
