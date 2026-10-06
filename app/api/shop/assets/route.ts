import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, checkOrigin } from "@/lib/auth";
import { saveShopAsset, readShopAsset } from "@/lib/shop-assets";
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
    if (Number(r.headers.get("content-length") || 0) > 4.4 * 1024 * 1024)
      throw new Error("Arquivo maior que 4 MB.");
    const f = await r.formData(),
      id = z.uuid().parse(f.get("order_id")),
      kind = String(f.get("kind")),
      file = f.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo.");
    return NextResponse.json({
      ok: true,
      result: await saveShopAsset(user, id, kind, file),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
export async function GET(r: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const asset = await readShopAsset(
      user,
      z.uuid().parse(new URL(r.url).searchParams.get("id")),
    );
    return new Response(asset.bytes as BodyInit, {
      headers: {
        "Content-Type": asset.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Arquivo não encontrado." },
      { status: 404 },
    );
  }
}
