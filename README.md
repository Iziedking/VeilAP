# VeilAP

Private payroll and approved supplier payments in USDC on Starknet.

VeilAP helps a finance team prepare an approved supplier batch, pay through a privacy-enabled wallet, reconcile the run, and issue a selectively shareable receipt. The first demo uses three synthetic international supplier invoices in USDC.

## Current status

The public landing page is a concise product ad with a three-state payment register. `/sign-in` is an honest wallet-sign-in preview, and `/workspace` contains the no-key payment desk. Wallet connection and STRK20 mainnet execution are the next build group. The interface does not claim that preview payments were sent.

## Why STRK20

Inside the STRK20 pool, private transfers can conceal the sender, recipient, amount, token, and note graph. Pool interaction and timing remain public, while deposits and withdrawals expose their public token legs. VeilAP will use the wallet-first route so viewing keys and proof generation remain in the user's privacy-enabled wallet.

## Stack

- Next.js 16 and React 19
- TypeScript in strict mode
- Local Manrope and Newsreader variable fonts
- starknet.js 10.4.0
- Starknet Wallet Standard discovery
- STRK20 Wallet API integration, planned behind one adapter

The Starknet integration packages match the official starter kit and are pinned exactly. Next.js, its lint config, ESLint, and Sharp use current patched pins because the starter's older framework set produced known high-severity advisories during installation on 2026-08-27.

## Start locally

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000` for the landing page, `http://localhost:3000/sign-in` for the sign-in preview, or `http://localhost:3000/workspace` for the payment desk. All three work without a wallet or RPC key.

Before wallet integration, replace `YOUR_ALCHEMY_KEY` in `.env.local`. Do not expose the RPC URL through a `NEXT_PUBLIC_` variable because the URL contains the key.

## Checks

```bash
npm run check
npm run build
```

## STRK20 sprint record

`strk20.json` is present at the repository root. It will hold only verified Starknet mainnet contract addresses, transactions that touched the official pool, and final demo links.

Pool address:

```text
0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a
```

Network: `SN_MAIN`

## Privacy boundary

The current commit is a UI preview with synthetic records. It performs no payment and sends no invoice data anywhere. The intended wallet-first build keeps viewing keys and proof generation in the user's wallet. Public chain observers can still see pool interaction and timing, and public deposit or withdrawal legs expose their amounts.

See [docs/PRIVACY.md](docs/PRIVACY.md) for the claim boundary.

## License

MIT
