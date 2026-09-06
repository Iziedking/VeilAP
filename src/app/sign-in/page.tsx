import Link from "next/link";

import { VeilLogo } from "@/components/veil-logo";
import { WalletSessionButton } from "@/components/wallet/wallet-session-button";
import { ArenaThemeToggle } from "@/components/arena/arena-theme-toggle";

export const metadata = {
  title: "Sign in | Veil Arena",
  description: "Sign in to enter agents, run competitions, and manage private rewards.",
};

function safeReturnPath(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\r\n]/.test(value)) return "/play";
  return value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const candidate = (await searchParams).returnTo;
  const returnTo = safeReturnPath(Array.isArray(candidate) ? candidate[0] : candidate);
  return (
    <div className="sign-in-page">
      <header className="sign-in-header">
        <Link href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
        <div className="sign-in-header-actions">
          <ArenaThemeToggle />
          <Link href="/">Back to home</Link>
        </div>
      </header>
      <main className="sign-in-main">
        <div className="sign-in-copy">
          <span>WALLET ACCESS</span>
          <h1>Sign in with your wallet.</h1>
          <p>Your signature proves that you control the address. It does not approve a payment or expose your keys.</p>
        </div>
        <section className="sign-in-panel" aria-labelledby="sign-in-title">
          <header><span>VEIL ARENA ACCESS</span><h2 id="sign-in-title">Continue with a wallet</h2></header>
          <div className="sign-in-options"><WalletSessionButton returnTo={returnTo} /></div>
          <p className="sign-in-boundary">Never share your private key or viewing key. Veil Arena will not ask for either.</p>
        </section>
      </main>
    </div>
  );
}
