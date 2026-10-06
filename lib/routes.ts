export type RoutePoint = {
  group?: "Prospecção" | "Leads" | "Clientes";
  id: string;
  name: string;
  address?: string;
  place_id?: string;
  latitude?: number;
  longitude?: number;
};
export function directionsLink(points: RoutePoint[], start: string) {
  if (!points.length) throw new Error("Selecione ao menos uma parada.");
  if (points.length > 4)
    throw new Error(
      "Divida a rota em trechos de até 4 paradas para facilitar o uso no celular.",
    );
  const address = (p: RoutePoint) =>
    p.latitude !== undefined && p.longitude !== undefined
      ? `${p.latitude},${p.longitude}`
      : p.address || "";
  if (points.some((p) => !address(p)))
    throw new Error("Informe endereço ou coordenadas de cada parada.");
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("travelmode", "driving");
  if (start) url.searchParams.set("origin", start);
  const dest = points.at(-1)!;
  url.searchParams.set("destination", address(dest));
  if (dest.place_id)
    url.searchParams.set("destination_place_id", dest.place_id);
  if (points.length > 1)
    url.searchParams.set(
      "waypoints",
      points.slice(0, -1).map(address).join("|"),
    );
  return url.toString();
}
