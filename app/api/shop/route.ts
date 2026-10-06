import { NextResponse } from "next/server";
import { currentUser, checkOrigin } from "@/lib/auth";
import { shopState, shopMutation } from "@/lib/shop-service";
export async function GET() {
  try {
    return NextResponse.json(await shopState(await currentUser()), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
export async function POST(r: Request) {
  if (!checkOrigin(r))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const d = await r.json();
    return NextResponse.json({
      ok: true,
      result: await shopMutation(d.action, d.data, user),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
