# VeilAP privacy boundary

Last verified against the STRK20 documentation export on 2026-08-27.

## What the intended wallet-first flow keeps private

For a private transfer inside the STRK20 pool, the protocol is designed to hide the sender, recipient, amount, token type, and notes spent. VeilAP will ask a compatible privacy wallet to prepare proofs and sign. The application must not receive or store the user's viewing key or private key.

## What remains observable

- A public observer can see that the STRK20 pool was called and when.
- Shielding and unshielding have public ERC-20 legs whose amounts are visible.
- Network metadata, wallet behavior, and a small anonymity set can create correlation risk.
- A supplier can disclose its own receipt or payment details.
- VeilAP's trusted application layer can read invoice data that a company enters unless later versions add end-to-end encrypted storage.

## Current preview

The preparatory interface uses synthetic company, supplier, invoice, and amount data. It does not connect a wallet, submit a transaction, or prove a payment. Any control that would move funds explains that integration is pending.

## Claim rule

Do not use the phrases "fully anonymous", "untraceable", or "end-to-end encrypted" unless the shipped architecture and repeatable evidence support them. Say exactly which fields are concealed from public chain observers and which parties can still read the business record.

