import { randomUUID } from "node:crypto";
import type { GooglePlace } from "./google-places";
import { googleFailure } from "./google-places";
import { extractMapsUrls, resolveMapsLink, MapsLinkError } from "./maps-links";
// Dados Google permanecem só em memória, por 15 minutos. Nenhuma ficha é gravada no CRM.
const previews = new Map<
  string,
  { owner: string; place: GooglePlace; url: string; expires: number }
>();
export function getMapsPreview(token: string, owner: string) {
  const p = previews.get(token);
  if (!p || p.owner !== owner || p.expires < Date.now())
    throw new MapsLinkError(
      "expired_preview",
      "Prévia expirada. Consulte o link novamente.",
    );
  return p;
}
export async function prepareMapsImport(
  input: { text: string; url?: string; name?: string; city?: string },
  owner: string,
) {
  const urls = extractMapsUrls(input.text);
  if (urls.length > 1 && !input.url) return { state: "select_url", urls };
  if (input.url && !urls.includes(input.url))
    throw new MapsLinkError(
      "invalid_url",
      "Selecione um dos links fornecidos.",
    );
  const identity = await resolveMapsLink(input.url || urls[0]);
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key)
    return {
      state: "configuration_pending",
      identity,
      message:
        "Preenchimento automático requer Places API (New). Você pode salvar o link e cadastrar os dados manualmente.",
    };
  if (!identity.place_id && !identity.hint && !(input.name && input.city))
    return {
      state: "needs_complement",
      identity,
      message:
        "Informe nome e cidade para identificar candidatos, ou preencha manualmente. CID não é Place ID.",
    };
  const mask = [
    "id",
    "displayName",
    "formattedAddress",
    "addressComponents",
    "googleMapsUri",
    "rating",
    "userRatingCount",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "websiteUri",
    "regularOpeningHours",
    "businessStatus",
    "primaryTypeDisplayName",
    "attributions",
  ];
  const detail = !!identity.place_id;
  const res = await fetch(
    detail
      ? `https://places.googleapis.com/v1/places/${identity.place_id}`
      : "https://places.googleapis.com/v1/places:searchText",
    {
      method: detail ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": detail
          ? mask.join(",")
          : mask.map((f) => "places." + f).join(","),
      },
      ...(!detail
        ? {
            body: JSON.stringify({
              textQuery: [input.name || identity.hint, input.city, "Brasil"]
                .filter(Boolean)
                .join(" "),
              languageCode: "pt-BR",
              regionCode: "BR",
              pageSize: 5,
            }),
          }
        : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    },
  );
  const data = await res.json();
  if (!res.ok) {
    const e = googleFailure(res.status, data);
    throw new MapsLinkError(e.code, e.error);
  }
  const candidates = (detail ? [data] : data.places || []).map(
    (place: GooglePlace) => {
      const token = randomUUID();
      previews.set(token, {
        owner,
        place: { ...place, queried: ["phone", "website", "hours"] },
        url: identity.url,
        expires: Date.now() + 900000,
      });
      return { token, place };
    },
  );
  for (const [id, p] of previews)
    if (p.expires < Date.now()) previews.delete(id);
  if (previews.size > 1000) previews.delete(previews.keys().next().value!);
  return {
    state: candidates.length ? "preview" : "not_found",
    identity,
    candidates,
    message: candidates.length
      ? "Confirme nome e endereço da empresa correta."
      : "Nenhuma empresa encontrada. Complete os dados manualmente.",
  };
}
