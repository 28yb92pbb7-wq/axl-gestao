import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { operationalRole } from "@/lib/operations-schema";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || !operationalRole(user.role))
    return new NextResponse("Acesso não autorizado", { status: 401 });
  const key = process.env.GOOGLE_MAPS_EMBED_KEY;
  const params = new URL(request.url).searchParams;
  if (!key)
    return new NextResponse(
      "Mapa incorporado não configurado. Use os links Google Maps.",
      { status: 503 },
    );
  const mode = params.get("mode");
  const url = new URL(
    mode === "route"
      ? "https://www.google.com/maps/embed/v1/directions"
      : "https://www.google.com/maps/embed/v1/place",
  );
  if (mode === "route") {
    let points: string[];
    try {
      points = JSON.parse(params.get("points") || "[]");
      if (
        !Array.isArray(points) ||
        points.length < 2 ||
        points.length > 5 ||
        points.some((p) => typeof p !== "string" || !p.trim() || p.length > 250)
      )
        throw new Error("invalid");
    } catch {
      return new NextResponse("Informe até 4 paradas e uma origem.", {
        status: 400,
      });
    }
    url.searchParams.set("origin", points[0]);
    url.searchParams.set("destination", points.at(-1)!);
    if (points.length > 2)
      url.searchParams.set("waypoints", points.slice(1, -1).join("|"));
    url.searchParams.set("mode", "driving");
  } else {
    const place = params.get("place");
    if (!place || !/^[A-Za-z0-9_-]{1,250}$/.test(place))
      return new NextResponse("Identificador inválido", { status: 400 });
    url.searchParams.set("q", "place_id:" + place);
  }
  url.searchParams.set("key", key);
  return NextResponse.redirect(url, {
    status: 307,
    headers: { "Cache-Control": "no-store" },
  });
}
