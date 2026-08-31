"use client";

import type { WalletStandardWallet } from "@/lib/wallet/account";

interface WalletPickerProps {
  wallets: readonly WalletStandardWallet[];
  disabled?: boolean;
  onSelect: (wallet: WalletStandardWallet) => void;
}

export function WalletPicker({ wallets, disabled, onSelect }: WalletPickerProps) {
  if (wallets.length === 0) {
    return (
      <div className="wallet-empty" role="status">
        <strong>No Starknet wallet found</strong>
        <span>Install or unlock a compatible Starknet wallet, then refresh the page.</span>
      </div>
    );
  }

  return (
    <div className="wallet-picker" aria-label="Available Starknet wallets">
      {wallets.map((wallet) => (
        <button
          className="wallet-option"
          disabled={disabled}
          key={wallet.name}
          onClick={() => onSelect(wallet)}
          type="button"
        >
          <span aria-hidden="true">{wallet.name.slice(0, 1).toUpperCase()}</span>
          <strong>{wallet.name}</strong>
          <small>Connect</small>
        </button>
      ))}
    </div>
  );
}
