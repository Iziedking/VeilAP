import Link from "next/link";

import { VeilLogo } from "@/components/veil-logo";
import { WalletSessionButton } from "@/components/wallet/wallet-session-button";

export const metadata = {
  title: "Sign in | Veil Arena",
  description: "Sign in to manage sealed agent submissions and private STRK20 prizes.",
};

export default function SignInPage() {
  return (
    <div className="sign-in-page">
      <header className="sign-in-header">
        <Link href="/" aria-label="Veil Arena home"><VeilLogo /></Link>
        <Link href="/">Back to home</Link>
      </header>
      <main className="sign-in-main">
        <div className="sign-in-copy">
          <span>SEALED COMPETITOR ACCESS</span>
          <h1>Sign in securely. Keep your keys.</h1>
          <p>Use a compatible Starknet wallet to confirm your role. Your keys stay with you while Veil Arena prepares private submissions and prize settlement.</p>
        </div>
        <section className="sign-in-panel" aria-labelledby="sign-in-title">
          <header><span>VEIL ARENA ACCESS</span><h2 id="sign-in-title">Continue with a wallet</h2></header>
          <div className="sign-in-options"><WalletSessionButton /></div>
          <p className="sign-in-boundary">Veil Arena will never ask for a private key or viewing key.</p>
        </section>
      </main>
    </div>
  );
}
