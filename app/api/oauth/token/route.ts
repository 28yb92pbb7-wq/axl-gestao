import { requestOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/assistant-oauth";
export async function POST(r: Request) {
  try {
    const d = Object.fromEntries((await r.formData()).entries());
    return NextResponse.json(await exchangeCode(d, requestOrigin(r)), {
      headers: { "Cache-Control": "no-store", Pragma: "no-cache" },
    });
  } catch {
    return NextResponse.json(
      { error: "invalid_grant" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
