"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import {
  connectSessionWallet,
  disconnectSessionWallet,
  type WalletStandardWallet,
} from "@/lib/wallet/account";
import { useDiscoveredWallets } from "@/lib/wallet/wallet-store";
import type { AuthChallenge } from "@/server/auth/challenge";

import { WalletPicker } from "./wallet-picker";

type FlowState =
  | "idle"
  | "checking-session"
  | "connecting"
  | "awaiting-signature"
  | "verifying"
  | "unsupported"
  | "wrong-network"
  | "authenticated"
  | "error";

function signatureStrings(signature: unknown): string[] {
  if (Array.isArray(signature)) return signature.map(String);
  if (signature && typeof signature === "object") {
    const value = signature as { r?: unknown; s?: unknown };
    if (value.r !== undefined && value.s !== undefined) {
      return [String(value.r), String(value.s)];
    }
  }
  throw new Error("SIGNATURE_FORMAT_UNSUPPORTED");
}

function messageFor(code: string): string {
  if (code === "CONFIGURATION_MISSING") {
    return "Wallet sign-in is not configured on this server yet.";
  }
  if (code === "RPC_NOT_CONFIGURED") {
    return "Mainnet verification is not configured on the server yet.";
  }
  if (code === "WALLET_ACCOUNT_NOT_DEPLOYED") {
    return "This Starknet account is not active yet. Deploy it in Argent X, then try again.";
  }
  if (code === "RPC_UNAVAILABLE" || code === "SIGNATURE_UNAVAILABLE") {
    return "Starknet could not verify this account. Check that it is active on Mainnet, then try again.";
  }
  if (code === "SIGNATURE_INVALID") {
    return "Starknet rejected the signature. Refresh the page and sign a new request.";
  }
  if (code === "CHALLENGE_EXPIRED") {
    return "The sign-in request expired. Try again to create a fresh request.";
  }
  return "We could not verify this wallet session. No payment or transfer was approved.";
}

export function WalletSessionButton({ returnTo = "/play" }: { returnTo?: string }) {
  const wallets = useDiscoveredWallets();
  const [flow, setFlow] = useState<FlowState>("checking-session");
  const [message, setMessage] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [connectedWallet, setConnectedWallet] = useState<WalletStandardWallet>();

  useEffect(() => {
    let active = true;
    void apiFetch("/api/auth/session")
      .then(async (response) => {
        const body = await response.json() as {
          ok: boolean;
          value?: { walletAddress?: string };
        };
        if (!active) return;
        if (response.ok && body.ok && body.value?.walletAddress) {
          setWalletAddress(body.value.walletAddress);
          setConnectedWallet(
            wallets.find((candidate) =>
              candidate.accounts.some((account) => account.address === body.value?.walletAddress),
            ),
          );
          setFlow("authenticated");
          return;
        }
        setFlow("idle");
      })
      .catch(() => {
        if (active) setFlow("idle");
      });
    return () => {
      active = false;
    };
  }, [wallets]);

  async function authenticate(wallet: WalletStandardWallet) {
    setMessage("");
    setErrorCode("");
    setFlow("connecting");
    let connected: Awaited<ReturnType<typeof connectSessionWallet>> | undefined;
    try {
      connected = await connectSessionWallet(wallet);
      if (connected.kind === "unsupported") {
        setFlow("unsupported");
        setMessage(`This wallet needs STRK20 Wallet API ${connected.minimum} or newer.`);
        return;
      }
      if (connected.kind === "wrong-network") {
        setFlow("wrong-network");
        setMessage("Switch this wallet to Starknet Mainnet, then try again.");
        return;
      }

      const walletAddress = connected.account.address;
      const challengeResponse = await apiFetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, chainId: "SN_MAIN" }),
      });
      const challengeBody = (await challengeResponse.json()) as {
        ok: boolean;
        code?: string;
        challenge?: AuthChallenge;
      };
      if (!challengeResponse.ok || !challengeBody.challenge) {
        throw new Error(challengeBody.code ?? "CHALLENGE_FAILED");
      }

      setFlow("awaiting-signature");
      const signature = signatureStrings(
        await connected.account.signMessage(challengeBody.challenge.typedData),
      );
      setFlow("verifying");
      const verifyResponse = await apiFetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: challengeBody.challenge,
          walletAddress,
          signature,
        }),
      });
      const verified = (await verifyResponse.json()) as {
        ok: boolean;
        code?: string;
        walletAddress?: string;
      };
      if (!verifyResponse.ok || !verified.walletAddress) {
        throw new Error(verified.code ?? "VERIFY_FAILED");
      }
      setWalletAddress(verified.walletAddress);
      setConnectedWallet(wallet);
      setFlow("authenticated");
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH_FAILED";
      setErrorCode(code);
      setMessage(messageFor(code));
      setFlow("error");
    } finally {
      if (connected?.kind === "connected") connected.account.unsubscribeChange();
    }
  }

  async function logout() {
    try {
      const response = await apiFetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("LOGOUT_FAILED");
      const walletToDisconnect = connectedWallet ?? wallets.find((candidate) =>
        candidate.accounts.some((account) => account.address === walletAddress),
      );
      if (walletToDisconnect) await disconnectSessionWallet(walletToDisconnect);
      setWalletAddress("");
      setConnectedWallet(undefined);
      setMessage("");
      setErrorCode("");
      setFlow("idle");
    } catch {
      setMessage("The wallet could not be disconnected. Try again or disconnect it in the wallet.");
      setFlow("error");
    }
  }

  if (flow === "authenticated") {
    return (
      <div className="wallet-authenticated" role="status">
        <span>SESSION VERIFIED</span>
        <strong>{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</strong>
        <p>You proved control of this wallet. No payment permission was requested.</p>
        <Link className="sign-in-preview" href={returnTo}>Continue to the arena</Link>
        <button className="wallet-logout" type="button" onClick={logout}>Disconnect wallet</button>
      </div>
    );
  }

  const busy = flow === "checking-session" || flow === "connecting" || flow === "awaiting-signature" || flow === "verifying";
  return (
    <>
      {flow !== "checking-session" ? <WalletPicker wallets={wallets} disabled={busy} onSelect={authenticate} /> : null}
      <p className="sign-in-status" aria-live="polite">
        {flow === "checking-session" && "Checking your session..."}
        {flow === "connecting" && "Checking wallet compatibility..."}
        {flow === "awaiting-signature" && "Review the Veil Arena sign-in message in your wallet."}
        {flow === "verifying" && "Verifying your signature on Starknet Mainnet..."}
        {!busy && message}
        {flow === "idle" && "Choose a wallet. This signature proves control and cannot move funds."}
      </p>
      {(errorCode === "WALLET_ACCOUNT_NOT_DEPLOYED"
        || flow === "error"
        || flow === "unsupported"
        || flow === "wrong-network") && (
        <div className="wallet-recovery-actions">
          {errorCode === "WALLET_ACCOUNT_NOT_DEPLOYED" && (
            <a
              className="wallet-activation-help"
              href="https://support.argent.xyz/hc/en-us/articles/8802319054237-How-to-activate-deploy-my-Argent-Starknet-wallet"
              target="_blank"
              rel="noreferrer"
            >
              Open Argent X activation steps
            </a>
          )}
          {(flow === "error" || flow === "unsupported" || flow === "wrong-network") && (
            <button className="wallet-retry" type="button" onClick={() => {
              setErrorCode("");
              setMessage("");
              setFlow("idle");
            }}>
              Try another wallet
            </button>
          )}
        </div>
      )}
    </>
  );
}
