/** URL pública: Host é validado como autoridade, nunca usado como destino de fetch. */
export function requestOrigin(request: Request) {
  if (process.env.AXL_PUBLIC_URL) {
    const u = new URL(process.env.AXL_PUBLIC_URL);
    if (u.protocol !== "https:" && process.env.NODE_ENV === "production")
      throw new Error("AXL_PUBLIC_URL precisa usar HTTPS.");
    return u.origin;
  }
  const host = request.headers.get("host");
  if (!host || !/^([A-Za-z0-9.-]+)(:\d{1,5})?$/.test(host))
    throw new Error("Host inválido.");
  const protocol =
    process.env.NODE_ENV === "production"
      ? "https:"
      : new URL(request.url).protocol;
  return new URL(`${protocol}//${host}`).origin;
}
