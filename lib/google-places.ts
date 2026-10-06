export type GooglePlace = {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  location?: { latitude: number; longitude: number };
  addressComponents?: { longText: string; types: string[] }[];
  primaryTypeDisplayName?: { text: string };
  attributions?: { provider: string; providerUri: string }[];
  queried?: string[];
  municipality?: "matched" | "different" | "unknown";
  distance?: number;
};
export function municipality(p: GooglePlace, city: string) {
  if (!city.trim()) return "unknown";
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const c = p.addressComponents?.find(
    (c) =>
      c.types.includes("administrative_area_level_2") ||
      c.types.includes("locality"),
  );
  return !c
    ? "unknown"
    : normalize(c.longText) === normalize(city)
      ? "matched"
      : "different";
}
export function googleFailure(http: number, payload: unknown) {
  const e = (
    payload as { error?: { status?: string; details?: { reason?: string }[] } }
  )?.error;
  const reasons = (e?.details || []).map((x) => x.reason || "");
  const r = reasons.join(" ");
  if (/API_KEY_INVALID/.test(r) || http === 401)
    return {
      code: "invalid_key",
      error:
        "Chave Google inválida. Confira a chave privada configurada no servidor.",
    };
  if (/SERVICE_DISABLED|API_DISABLED/.test(r))
    return {
      code: "api_disabled",
      error: "Habilite Places API (New) no projeto Google Cloud desta chave.",
    };
  if (/BILLING/.test(r))
    return {
      code: "billing",
      error:
        "O Google exige faturamento ativo para esta consulta. Confira a conta de faturamento vinculada.",
    };
  if (/API_KEY_.*BLOCKED|IP_|REFERRER/.test(r))
    return {
      code: "restriction",
      error:
        "As restrições da chave impediram a consulta do servidor. Confira permissões para Places API (New) e restrições de IP.",
    };
  if (http === 429 || e?.status === "RESOURCE_EXHAUSTED")
    return {
      code: "quota",
      error:
        "Cota do Google excedida. Confira limites e faturamento no Google Cloud.",
    };
  if (http === 403)
    return {
      code: "permission",
      error:
        "Google recusou o acesso. Confira API habilitada, faturamento e restrições da chave; a resposta não especificou a causa.",
    };
  return {
    code: "provider",
    error:
      "Google não concluiu a consulta. Tente novamente e confira o painel Google Cloud.",
  };
}
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
