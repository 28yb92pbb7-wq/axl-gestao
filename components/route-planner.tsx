"use client";
import { useState } from "react";
import { directionsLink, type RoutePoint } from "@/lib/routes";
export default function RoutePlanner({ points }: { points: RoutePoint[] }) {
  const [groups, setGroups] = useState(["Prospecção", "Leads", "Clientes"]);
  const [ids, setIds] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [error, setError] = useState("");
  return (
    <section className="panel settings-card">
      <h3>Lista de visitas e rota externa</h3>
      <p>
        Selecione na ordem desejada. O Google calcula o trajeto; esta lista não
        faz otimização automática.
      </p>
      <label>
        Ponto de partida
        <input
          value={start}
          onChange={(e) => setStart(e.target.value)}
          placeholder="Endereço ou latitude,longitude"
        />
      </label>
      <button
        className="secondary"
        onClick={() => {
          if (!navigator.geolocation) {
            setError("GPS não disponível. Informe um endereço.");
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (p) => setStart(`${p.coords.latitude},${p.coords.longitude}`),
            () =>
              setError(
                "Localização não autorizada ou indisponível. Informe um endereço.",
              ),
          );
        }}
      >
        Usar minha localização como partida
      </button>
      <p className="muted">
        GPS é a sua posição, com consentimento do navegador. Não será salvo como
        endereço de uma empresa.
      </p>
      <div className="row-actions">
        {["Prospecção", "Leads", "Clientes"].map((g) => (
          <label key={g} className="route-choice">
            <input
              type="checkbox"
              checked={groups.includes(g)}
              onChange={(e) =>
                setGroups(
                  e.target.checked
                    ? [...groups, g]
                    : groups.filter((v) => v !== g),
                )
              }
            />
            {g}
          </label>
        ))}
      </div>
      {points
        .filter((p) => !p.group || groups.includes(p.group))
        .map((p) => (
          <label key={p.id} className="route-choice">
            <input
              type="checkbox"
              checked={ids.includes(p.id)}
              onChange={(e) =>
                setIds(
                  e.target.checked
                    ? [...ids, p.id]
                    : ids.filter((id) => id !== p.id),
                )
              }
            />
            {ids.includes(p.id) ? `${ids.indexOf(p.id) + 1}. ` : ""}
            {p.name} ·{" "}
            {p.latitude === undefined
              ? "sem coordenadas; usar endereço"
              : "coordenadas disponíveis"}
            {!p.address && p.latitude === undefined
              ? " · endereço a completar"
              : ""}
          </label>
        ))}
      <button
        className="primary"
        onClick={() => {
          try {
            window.open(
              directionsLink(
                ids.map((id) => points.find((p) => p.id === id)!),
                start,
              ),
              "_blank",
              "noopener,noreferrer",
            );
            setError("");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Abrir rota no Google Maps
      </button>
      <p className="muted">
        Até 4 paradas por trecho. Navegadores e celulares podem limitar os
        pontos intermediários; confirme as paradas no Google Maps.
      </p>
      {error && <p className="notice error">{error}</p>}
    </section>
  );
}
