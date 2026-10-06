import { NextResponse } from "next/server";
import { z } from "zod";
import { checkOrigin, currentUser } from "@/lib/auth";
import { operationalRole } from "@/lib/operations-schema";
import {
  googleFailure,
  municipality,
  distanceKm,
  type GooglePlace,
} from "@/lib/google-places";
const limits = new Map<string, number[]>();
const schema = z
  .object({
    mode: z.enum(["search", "detail", "test"]).default("search"),
    query: z.string().trim().max(100).default(""),
    city: z.string().trim().max(100).default(""),
    state: z.string().max(2).default(""),
    neighborhood: z.string().max(100).default(""),
    postal_code: z.string().max(12).default(""),
    page_token: z.string().max(2000).optional(),
    place_id: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .max(250)
      .optional(),
    fields: z.array(z.enum(["phone", "website", "hours"])).default([]),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radius: z.number().min(100).max(50000).default(10000),
  })
  .refine((d) => (d.latitude === undefined) === (d.longitude === undefined), {
    message: "Informe latitude e longitude juntas.",
  });
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user || !operationalRole(user.role))
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 401 },
    );
  let data: z.infer<typeof schema>;
  try {
    data = schema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Verifique os campos da consulta." },
      { status: 400 },
    );
  }
  if (data.mode === "test" && user.role !== "ADMIN")
    return NextResponse.json(
      { error: "Diagnóstico restrito ao administrador." },
      { status: 403 },
    );
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key)
    return NextResponse.json(
      {
        code: "missing_key",
        error:
          "Configure GOOGLE_PLACES_API_KEY no servidor Vercel. Cadastros e vendas continuam funcionando sem Google.",
      },
      { status: 503 },
    );
  const history = (limits.get(user.id) || []).filter(
    (t) => t > Date.now() - 60000,
  );
  if (history.length >= 8)
    return NextResponse.json(
      {
        code: "local_rate",
        error: "Aguarde um minuto para fazer novas consultas.",
      },
      { status: 429 },
    );
  limits.set(user.id, [...history, Date.now()]);
  if (data.mode === "detail" && !data.place_id)
    return NextResponse.json(
      { error: "Informe o identificador do estabelecimento." },
      { status: 400 },
    );
  if (data.mode === "search" && !data.city && data.latitude === undefined)
    return NextResponse.json(
      { error: "Informe uma cidade ou referência geográfica." },
      { status: 400 },
    );
  const detail = data.mode === "detail";
  const fields = detail ? ["phone", "website", "hours"] : data.fields;
  const mask = [
    "id",
    "displayName",
    "formattedAddress",
    "addressComponents",
    "location",
    "rating",
    "userRatingCount",
    "googleMapsUri",
    "primaryTypeDisplayName",
    "attributions",
    ...(fields.includes("phone")
      ? ["nationalPhoneNumber", "internationalPhoneNumber"]
      : []),
    ...(fields.includes("website") ? ["websiteUri"] : []),
    ...(fields.includes("hours") ? ["regularOpeningHours"] : []),
  ];
  try {
    const response = await fetch(
      detail
        ? "https://places.googleapis.com/v1/places/" + data.place_id
        : "https://places.googleapis.com/v1/places:searchText",
      {
        method: detail ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": detail
            ? mask.join(",")
            : "nextPageToken," + mask.map((f) => "places." + f).join(","),
        },
        ...(detail
          ? {}
          : {
              body: JSON.stringify({
                textQuery:
                  data.mode === "test"
                    ? "comércios em Valinhos SP Brasil"
                    : [
                        data.query || "comércios",
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
                pageSize: data.mode === "test" ? 1 : 20,
                ...(data.page_token ? { pageToken: data.page_token } : {}),
                ...(data.latitude !== undefined && data.longitude !== undefined
                  ? {
                      locationBias: {
                        circle: {
                          center: {
                            latitude: data.latitude,
                            longitude: data.longitude,
                          },
                          radius: data.radius,
                        },
                      },
                    }
                  : {}),
              }),
            }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    const result = await response.json();
    if (!response.ok)
      return NextResponse.json(googleFailure(response.status, result), {
        status: 502,
      });
    if (data.mode === "test")
      return NextResponse.json({
        ok: true,
        message:
          "Places API (New) respondeu. Chave e acesso válidos para esta consulta.",
        map_configured: !!process.env.GOOGLE_MAPS_EMBED_KEY,
      });
    const enrich = (p: GooglePlace) => ({
      ...p,
      queried: fields,
      municipality: municipality(p, data.city),
      ...(p.location &&
      data.latitude !== undefined &&
      data.longitude !== undefined
        ? {
            distance: distanceKm(p.location, {
              latitude: data.latitude,
              longitude: data.longitude,
            }),
          }
        : {}),
    });
    return NextResponse.json(
      detail
        ? { place: enrich(result) }
        : {
            places: (result.places || []).map(enrich),
            next_page_token: result.nextPageToken,
            synced_at: new Date().toISOString(),
            coverage:
              "Consulta limitada às páginas carregadas; não representa todos os comércios da cidade.",
          },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        code: "network",
        error:
          "Falha de rede ou tempo limite entre o servidor e Google Places. Tente novamente.",
      },
      { status: 502 },
    );
  }
}
