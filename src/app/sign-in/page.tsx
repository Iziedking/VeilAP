import Link from "next/link";

import { VeilLogo } from "@/components/veil-logo";

export const metadata = {
  title: "Sign in | VeilAP",
  description: "Sign in to prepare private payroll and supplier payment runs.",
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
          <span>PRIVATE PAYMENT DESK</span>
          <h1>Sign in without handing over your keys.</h1>
          <p>A compatible Starknet wallet will confirm your identity and keep proof generation under your control.</p>
        </div>
        <section className="sign-in-panel" aria-labelledby="sign-in-title">
          <header><span>VEILAP ACCESS</span><h2 id="sign-in-title">Continue with a wallet</h2></header>
          <div className="sign-in-options">
            <button className="sign-in-wallet" type="button" disabled>Wallet sign-in is next</button>
            <p className="sign-in-status">The current build is a safe product preview. It will not request wallet access.</p>
            <Link className="sign-in-preview" href="/workspace">Open the preview desk</Link>
          </div>
          <p className="sign-in-boundary">VeilAP will never ask for a private key or viewing key.</p>
        </section>
      </main>
    </div>
  );
}
