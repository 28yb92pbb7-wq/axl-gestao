import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, currentUser } from "@/lib/auth";
const limits = new Map<string, number[]>();
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user || user.role !== "ADMIN")
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key)
    return NextResponse.json(
      {
        error:
          "Configure GOOGLE_PLACES_API_KEY no servidor para pesquisar estabelecimentos reais. Cadastros e CRM continuam disponíveis.",
      },
      { status: 503 },
    );
  const history = (limits.get(user.id) || []).filter(
    (t) => t > Date.now() - 60000,
  );
  if (history.length >= 5)
    return NextResponse.json(
      { error: "Aguarde um minuto antes de pesquisar novamente." },
      { status: 429 },
    );
  limits.set(user.id, [...history, Date.now()]);
  try {
    const data = z
      .object({
        query: z.string().trim().min(2).max(100),
        city: z.string().trim().min(2).max(100),
        state: z.string().length(2).default("SP"),
        neighborhood: z.string().max(100).default(""),
        postal_code: z.string().max(12).default(""),
        page_token: z.string().max(2000).optional(),
      })
      .parse(await request.json());
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "nextPageToken,places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.primaryTypeDisplayName,places.attributions",
        },
        body: JSON.stringify({
          textQuery: [
            data.query,
            data.neighborhood,
            data.city,
            data.state,
            data.postal_code,
            "Brasil",
          ]
            .filter(Boolean)
            .join(" "),
          languageCode: "pt-BR",
          regionCode: "BR",
          pageSize: 20,
          ...(data.page_token ? { pageToken: data.page_token } : {}),
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    if (!response.ok)
      return NextResponse.json(
        {
          error:
            response.status === 403
              ? "O Google recusou a chave ou o acesso à Places API. Confira API habilitada, faturamento e restrições."
              : "A pesquisa no Google não foi concluída. Tente novamente mais tarde.",
        },
        { status: 502 },
      );
    const result = await response.json();
    return NextResponse.json(
      {
        places: result.places || [],
        next_page_token: result.nextPageToken,
        synced_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Verifique os filtros ou a conexão com a API Google." },
      { status: 400 },
    );
  }
}
