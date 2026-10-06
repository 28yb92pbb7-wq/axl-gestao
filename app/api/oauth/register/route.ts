import { NextResponse } from "next/server";
import { registerClient } from "@/lib/assistant-oauth";
const rate = new Map<string, number>();
export async function POST(r: Request) {
  try {
    const key = r.headers.get("x-forwarded-for") || "unknown";
    const last = rate.get(key) || 0;
    if (last > Date.now() - 10000)
      return NextResponse.json({ error: "slow_down" }, { status: 429 });
    rate.set(key, Date.now());
    return NextResponse.json(await registerClient(await r.json()), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata" },
      { status: 400 },
    );
  }
}
