export type ArenaPrizeTokenId = "USDC" | "STRK";

export type ArenaPrizeToken = {
  id: ArenaPrizeTokenId;
  symbol: ArenaPrizeTokenId;
  name: string;
  address: string;
  decimals: number;
};

/** Canonical Starknet Mainnet assets offered by the sponsor flow. */
export const ARENA_PRIZE_TOKENS: Record<ArenaPrizeTokenId, ArenaPrizeToken> = {
  USDC: {
    id: "USDC",
    symbol: "USDC",
    name: "USD Coin",
    address: "0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb",
    decimals: 6,
  },
  STRK: {
    id: "STRK",
    symbol: "STRK",
    name: "Starknet Token",
    address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    decimals: 18,
  },
};
