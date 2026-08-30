"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api/client";
import { connectSessionWallet, type WalletStandardWallet } from "@/lib/wallet/account";
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
    return "Wallet sign-in is unavailable until persisted security configuration is installed.";
  }
  if (code === "RPC_NOT_CONFIGURED") {
    return "Mainnet verification is not configured yet. Add the server RPC setting and retry.";
  }
  return "The wallet session could not be verified. Nothing was signed beyond this sign-in request.";
}

export function WalletSessionButton() {
  const wallets = useDiscoveredWallets();
  const [flow, setFlow] = useState<FlowState>("checking-session");
  const [message, setMessage] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

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
  }, []);

  async function authenticate(wallet: WalletStandardWallet) {
    setMessage("");
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
      setFlow("authenticated");
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTH_FAILED";
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
      setWalletAddress("");
      setMessage("");
      setFlow("idle");
    } catch {
      setMessage("The session could not be cleared. Refresh and try again.");
      setFlow("error");
    }
  }

  if (flow === "authenticated") {
    return (
      <div className="wallet-authenticated" role="status">
        <span>SESSION VERIFIED</span>
        <strong>{walletAddress.slice(0, 10)}...{walletAddress.slice(-6)}</strong>
        <p>Your wallet proved control. No payment permission was requested.</p>
        <Link className="sign-in-preview" href="/play">Enter the arena</Link>
        <button className="wallet-logout" type="button" onClick={logout}>Sign out</button>
      </div>
    );
  }

  const busy = flow === "checking-session" || flow === "connecting" || flow === "awaiting-signature" || flow === "verifying";
  return (
    <>
      {flow !== "checking-session" ? <WalletPicker wallets={wallets} disabled={busy} onSelect={authenticate} /> : null}
      <p className="sign-in-status" aria-live="polite">
        {flow === "checking-session" && "Checking your secure session..."}
        {flow === "connecting" && "Checking STRK20 support before requesting access..."}
        {flow === "awaiting-signature" && "Review the Veil Arena sign-in message in your wallet."}
        {flow === "verifying" && "Verifying the signed session on Starknet Mainnet..."}
        {!busy && message}
        {flow === "idle" && "Choose a wallet. Signing proves control only. It cannot move funds."}
      </p>
      {(flow === "error" || flow === "unsupported" || flow === "wrong-network") && (
        <button className="wallet-retry" type="button" onClick={() => setFlow("idle")}>
          Try another wallet
        </button>
      )}
    </>
  );
}
