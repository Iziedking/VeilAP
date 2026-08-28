import { NextResponse } from "next/server";

import { getReceiptPublicKey } from "@/server/projects/runtime";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(
      { ok: true, value: getReceiptPublicKey() },
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
