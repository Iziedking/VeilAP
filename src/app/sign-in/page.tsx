import Link from "next/link";

import { VeilLogo } from "@/components/veil-logo";
import { WalletSessionButton } from "@/components/wallet/wallet-session-button";

export const metadata = {
  title: "Sign in | VeilAP",
  description: "Sign in to review private proof streams and prepare protected releases.",
};

export default function SignInPage() {
  return (
    <div className="sign-in-page">
      <header className="sign-in-header">
        <Link href="/" aria-label="VeilAP home"><VeilLogo /></Link>
        <Link href="/">Back to home</Link>
      </header>
      <main className="sign-in-main">
        <div className="sign-in-copy">
          <span>PRIVATE DELIVERY DESK</span>
          <h1>Sign in without handing over your keys.</h1>
          <p>A compatible Starknet wallet will confirm your role while keeping signing and STRK20 proof generation under your control.</p>
        </div>
        <section className="sign-in-panel" aria-labelledby="sign-in-title">
          <header><span>VEILAP ACCESS</span><h2 id="sign-in-title">Continue with a wallet</h2></header>
          <div className="sign-in-options"><WalletSessionButton /></div>
          <p className="sign-in-boundary">VeilAP will never ask for a private key or viewing key.</p>
        </section>
      </main>
    </div>
  );
}
