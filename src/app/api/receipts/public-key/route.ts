import { NextResponse } from "next/server";

import { requirePersistedConfig } from "@/server/env";
import { createReceiptSigner } from "@/server/receipts/signing";

export const runtime = "nodejs";

function getPublicKey() {
  const config = requirePersistedConfig();
  if (!config.receiptSigningPrivateKey || !config.receiptSigningPublicKey) {
    throw new Error("CONFIGURATION_MISSING");
  }
  return createReceiptSigner({
    privateKeyBase64: config.receiptSigningPrivateKey,
    publicKeyBase64: config.receiptSigningPublicKey,
  }).publicKey();
}

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, value: getPublicKey() },
      { headers: { "Cache-Control": "public, max-age=300" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "CONFIGURATION_MISSING") {
      return NextResponse.json(
        { ok: false, code: "CONFIGURATION_MISSING" },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(
      { ok: false, code: "SIGNING_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
