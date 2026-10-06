import { isIP } from "node:net";
export class MapsLinkError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const hosts = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "google.com.br",
  "www.google.com.br",
  "maps.google.com",
]);
export function validateMapsUrl(value: string) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new MapsLinkError(
      "invalid_url",
      "Cole um link HTTPS da ficha de uma empresa no Google Maps.",
    );
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    isIP(u.hostname) ||
    !hosts.has(u.hostname)
  )
    throw new MapsLinkError(
      "blocked_url",
      "Endereço não permitido. Use Compartilhar → Copiar link no Google Maps.",
    );
  const short = u.hostname === "maps.app.goo.gl";
  if (short && !/^\/[A-Za-z0-9_-]{4,100}\/?$/.test(u.pathname))
    throw new MapsLinkError("unsupported", "Link curto não reconhecido.");
  if (
    u.hostname === "goo.gl" &&
    !/^\/maps\/[A-Za-z0-9_-]{4,100}\/?$/.test(u.pathname)
  )
    throw new MapsLinkError(
      "unsupported",
      "Use um link goo.gl/maps de estabelecimento.",
    );
  if (
    !short &&
    u.hostname !== "goo.gl" &&
    !/^\/maps(?:\/|$)/.test(u.pathname) &&
    u.hostname !== "maps.google.com"
  )
    throw new MapsLinkError("unsupported", "Este link não é do Google Maps.");
  if (u.href.length > 4096)
    throw new MapsLinkError("invalid_url", "Link muito longo.");
  return u;
}
export function extractMapsUrls(text: string) {
  if (text.length > 10000)
    throw new MapsLinkError("invalid_url", "Texto muito longo.");
  const matches = [
    ...new Set(
      (text.match(/https:\/\/[^\s<>"']+/g) || []).map((s) =>
        s.replace(/[),.;]+$/, ""),
      ),
    ),
  ];
  if (!matches.length)
    throw new MapsLinkError(
      "invalid_url",
      "Nenhum link HTTPS encontrado no texto.",
    );
  return matches.map((x) => validateMapsUrl(x).href);
}
export type MapsIdentity = {
  url: string;
  place_id?: string;
  hint?: string;
  needs_complement?: boolean;
};
export function identifyMapsUrl(value: string): MapsIdentity {
  const u = validateMapsUrl(value);
  const path = decodeURIComponent(u.pathname);
  if (
    /\/maps\/(dir|d|lists)(\/|$)/.test(path) ||
    u.searchParams.has("destination") ||
    u.searchParams.has("waypoints")
  )
    throw new MapsLinkError(
      "not_business",
      "Compartilhe a ficha de uma empresa, não uma rota ou lista.",
    );
  const explicit =
    u.searchParams.get("query_place_id") ||
    u.searchParams.get("place_id") ||
    u.searchParams.get("q")?.match(/^place_id:([A-Za-z0-9_-]+)$/)?.[1] ||
    path.match(/!1s(ChI[A-Za-z0-9_-]+)(?:!|\/|$)/)?.[1];
  if (explicit) {
    if (!/^[A-Za-z0-9_-]{10,250}$/.test(explicit) || /^0x|^\d+$/.test(explicit))
      throw new MapsLinkError(
        "invalid_identity",
        "Identificador não reconhecido como Place ID.",
      );
    return { url: u.href, place_id: explicit };
  }
  const hint = path
    .match(/\/maps\/place\/([^/@]+)/)?.[1]
    ?.replace(/\+/g, " ")
    .trim();
  if (hint && !/^[-+\d.,\s]+$/.test(hint)) return { url: u.href, hint };
  if (u.searchParams.has("cid") || /!1s0x[\da-f]+:0x[\da-f]+/i.test(path))
    return { url: u.href, needs_complement: true };
  throw new MapsLinkError(
    "not_business",
    "Não foi possível identificar uma ficha de empresa. Compartilhe o estabelecimento ou informe nome e cidade junto com seu link.",
  );
}
export async function resolveMapsLink(
  value: string,
  fetcher: typeof fetch = fetch,
): Promise<MapsIdentity> {
  let u = validateMapsUrl(value);
  const deadline = AbortSignal.timeout(10000);
  for (let n = 0; n < 5; n++) {
    if (u.hostname !== "maps.app.goo.gl" && u.hostname !== "goo.gl")
      return identifyMapsUrl(u.href);
    const res = await fetcher(u.href, {
      method: "HEAD",
      redirect: "manual",
      signal: deadline,
      cache: "no-store",
    });
    await res.body?.cancel();
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get("location");
      if (!location || location.length > 4096)
        throw new MapsLinkError("expired_url", "Link sem destino válido.");
      u = validateMapsUrl(new URL(location, u).href);
      continue;
    }
    throw new MapsLinkError(
      "expired_url",
      "O link curto não pôde ser resolvido. Copie o endereço completo da ficha ou preencha manualmente.",
    );
  }
  throw new MapsLinkError(
    "redirect_limit",
    "O link excedeu o limite de redirecionamentos.",
  );
}
