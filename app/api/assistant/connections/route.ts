import { NextResponse } from "next/server";
import { currentUser, checkOrigin } from "@/lib/auth";
import { connections } from "@/lib/assistant-oauth";
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    return NextResponse.json(await connections(u), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
}
export async function POST(r: Request) {
  if (!checkOrigin(r))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const d = await r.json();
    return NextResponse.json(await connections(u, d.id));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
