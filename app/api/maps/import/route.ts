import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, checkOrigin } from "@/lib/auth";
import { operationalRole } from "@/lib/operations-schema";
import { prepareMapsImport, getMapsPreview } from "@/lib/maps-import";
import {
  MapsLinkError,
  extractMapsUrls,
  identifyMapsUrl,
} from "@/lib/maps-links";
const rate = new Map<string, number[]>();
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user || (!operationalRole(user.role) && user.role !== "COMPRADOR"))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  try {
    const input = z
      .object({
        manual: z.boolean().default(false),
        text: z.string().min(1).max(10000).optional(),
        url: z.string().max(4096).optional(),
        name: z.string().max(160).optional(),
        city: z.string().max(100).optional(),
        token: z.uuid().optional(),
      })
      .parse(await request.json());
    if (input.token) {
      const p = getMapsPreview(input.token, user.id);
      return NextResponse.json(
        { place: p.place, expires_at: new Date(p.expires).toISOString() },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const hits = (rate.get(user.id) || []).filter(
      (t) => t > Date.now() - 60000,
    );
    if (hits.length >= 8)
      return NextResponse.json(
        { error: "Aguarde um minuto para consultar novamente." },
        { status: 429 },
      );
    rate.set(user.id, [...hits, Date.now()]);
    if (input.manual) {
      const urls = extractMapsUrls(input.text || "");
      if (urls.length > 1 && !input.url)
        return NextResponse.json({ state: "select_url", urls });
      const url = input.url || urls[0];
      if (!urls.includes(url))
        throw new MapsLinkError("invalid_url", "Selecione um link do texto.");
      if (!/^https:\/\/(maps.app.goo.gl|goo.gl)\//.test(url))
        identifyMapsUrl(url);
      return NextResponse.json({
        state: "manual",
        identity: { url },
        message:
          "Cadastro manual: informe seus dados próprios. Nenhuma ficha Google foi importada.",
      });
    }
    const data = await prepareMapsImport(
      { ...input, text: input.text || "" },
      user.id,
    );
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        code: e instanceof MapsLinkError ? e.code : "temporary",
        error:
          e instanceof MapsLinkError
            ? e.message
            : "Falha temporária ao consultar. Tente novamente ou cadastre manualmente.",
      },
      { status: 400 },
    );
  }
}
