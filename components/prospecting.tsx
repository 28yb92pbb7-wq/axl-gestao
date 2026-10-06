"use client";
import { useState } from "react";
import {
  matchesPlace,
  placesFilterSchema,
  initialPlacesFilters,
  type PlacesFilters,
} from "@/lib/places";
import type { GooglePlace } from "@/lib/google-places";
import { opportunityScore } from "@/lib/domain";
import type { State } from "@/lib/types";
import { ActionForm, Dialog, Table, type Mutate } from "./ui";
import CompanyDetail from "./company-detail";
import QuickSaleForm from "./quick-sale-form";
import RoutePlanner from "./route-planner";
export default function Prospecting({
  state,
  mutate,
}: {
  state: State;
  mutate: Mutate;
}) {
  const [places, setPlaces] = useState<GooglePlace[]>([]);
  const [filters, setFilters] = useState<PlacesFilters>(initialPlacesFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<GooglePlace>();
  const [mode, setMode] = useState("detail");
  const [city, setCity] = useState("Valinhos");
  const [nextPage, setNextPage] = useState<string>();
  const [last, setLast] = useState<Record<string, unknown>>();
  const [synced, setSynced] = useState("");
  const [crm, setCrm] = useState("");
  const [responsible, setResponsible] = useState("");
  const [contactDate, setContactDate] = useState("");
  const [sort, setSort] = useState("name");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [map, setMap] = useState(false);
  const validation = placesFilterSchema.safeParse(filters);
  async function search(query: Record<string, unknown>, append = false) {
    setBusy(true);
    setError("");
    try {
      const fields = ["phone", "website", "hours"].filter(
        (k) => filters[k as "phone" | "website" | "hours"] !== "",
      );
      const r = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...query,
          fields,
          ...(append ? { page_token: nextPage } : {}),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPlaces((prev) => [
        ...new Map(
          [...(append ? prev : []), ...d.places].map((p: GooglePlace) => [
            p.id,
            p,
          ]),
        ).values(),
      ]);
      setNextPage(d.next_page_token);
      setSynced(d.synced_at);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const score = (p: GooglePlace) =>
    opportunityScore(
      {
        rating: p.rating,
        reviews: p.userRatingCount,
        phone: p.nationalPhoneNumber,
        website: p.websiteUri,
        segment: p.primaryTypeDisplayName?.text,
        contacted: state.companies.some((c) => c.place_id === p.id),
      },
      state.weights,
    ).score;
  const visible = places
    .filter((p) => {
      if (
        !validation.success ||
        !matchesPlace(p, validation.data) ||
        p.municipality === "different" ||
        (verifiedOnly && p.municipality !== "matched")
      )
        return false;
      if (
        last?.latitude !== undefined &&
        p.distance !== undefined &&
        p.distance > Number(last.radius || 10000) / 1000
      )
        return false;
      const c = state.companies.find((c) => c.place_id === p.id);
      if (crm && (crm === "unsaved" ? !!c : c?.status !== crm)) return false;
      if (responsible && c?.salesperson_id !== responsible) return false;
      if (
        contactDate &&
        !(state.contacts || []).some(
          (a) =>
            a.company_id === c?.id && a.created_at.slice(0, 10) >= contactDate,
        )
      )
        return false;
      return true;
    })
    .sort((a, b) =>
      sort === "rating"
        ? (b.rating ?? -1) - (a.rating ?? -1)
        : sort === "reviews"
          ? (b.userRatingCount ?? -1) - (a.userRatingCount ?? -1)
          : sort === "distance"
            ? (a.distance ?? Infinity) - (b.distance ?? Infinity)
            : sort === "opportunity"
              ? score(b) - score(a)
              : a.displayName.text.localeCompare(b.displayName.text),
    );
  const company = state.companies.find((c) => c.place_id === selected?.id);
  return (
    <>
      <p className="notice">
        Consulta oficial Google Places. Cada busca, detalhe ou página pode gerar
        cobrança. Dados Google ficam nesta sessão; o CRM guarda os dados
        comerciais confirmados por você. Pesquisa por cidade tem cobertura
        limitada.
      </p>
      <section className="panel settings-card">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q: Record<string, unknown> = Object.fromEntries(
              new FormData(e.currentTarget),
            );
            for (const k of ["latitude", "longitude", "radius"]) {
              if (q[k] === "") delete q[k];
              else if (q[k] !== undefined) q[k] = Number(q[k]);
            }
            setLast(q);
            setNextPage(undefined);
            void search(q);
          }}
        >
          <div className="form-grid">
            <label>
              Cidade
              <input
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <label>
              Segmento / busca livre (opcional)
              <input name="query" placeholder="Todos os comércios" />
            </label>
            <label>
              Estado (opcional)
              <input name="state" maxLength={2} defaultValue="SP" />
            </label>
            <label>
              Bairro
              <input name="neighborhood" />
            </label>
            <label>
              CEP
              <input name="postal_code" />
            </label>
          </div>
          <details>
            <summary>Referência geográfica e raio (opcionais)</summary>
            <div className="form-grid">
              <label>
                Latitude
                <input name="latitude" type="number" step="any" />
              </label>
              <label>
                Longitude
                <input name="longitude" type="number" step="any" />
              </label>
              <label>
                Raio em metros
                <input
                  name="radius"
                  type="number"
                  min="100"
                  max="50000"
                  defaultValue="10000"
                />
              </label>
            </div>
          </details>
          <button className="primary" disabled={busy}>
            {busy ? "Consultando…" : "Buscar estabelecimentos"}
          </button>
        </form>
        {error && (
          <p className="notice error" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="panel settings-card">
        <h3>Filtros combináveis</h3>
        <div className="form-grid">
          <label>
            Comparação de nota
            <select
              value={filters.ratingMode}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  ratingMode: e.target.value as PlacesFilters["ratingMode"],
                })
              }
            >
              <option value="range">Entre mínimo e máximo (inclusive)</option>
              <option value="eq">Igual à nota mínima</option>
              <option value="unknown">Nota não informada</option>
            </select>
          </label>
          {(["minimum", "maximum"] as const).map((k) => (
            <label key={k}>
              {k === "minimum" ? "Nota mínima / exata" : "Nota máxima"}
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={filters[k]}
                onChange={(e) =>
                  setFilters({ ...filters, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label>
            Comparação de avaliações
            <select
              value={filters.reviewMode}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  reviewMode: e.target.value as PlacesFilters["reviewMode"],
                })
              }
            >
              <option value="range">Entre mínimo e máximo (inclusive)</option>
              <option value="lt">Menor que mínimo</option>
              <option value="gt">Maior que mínimo</option>
              <option value="eq">Igual ao mínimo</option>
              <option value="unknown">Não informado</option>
            </select>
          </label>
          <label>
            Avaliações mínimas / exatas
            <input
              type="number"
              min="0"
              value={filters.minimumReviews}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  minimumReviews: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            Avaliações máximas
            <input
              type="number"
              min="0"
              value={filters.maximumReviews ?? ""}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  maximumReviews:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </label>
          {(["phone", "website", "hours"] as const).map((k) => (
            <label key={k}>
              {{ phone: "Telefone", website: "Site", hours: "Horários" }[k]}
              <select
                value={filters[k]}
                onChange={(e) =>
                  setFilters({ ...filters, [k]: e.target.value })
                }
              >
                <option value="">Todos</option>
                <option value="with">Com informação publicada</option>
                <option value="without">
                  Sem informação publicada (consultada)
                </option>
                <option value="unknown">Não consultado / desconhecido</option>
              </select>
            </label>
          ))}
          <label>
            Status CRM
            <select value={crm} onChange={(e) => setCrm(e.target.value)}>
              <option value="">Todos</option>
              <option value="unsaved">Ainda não salvo</option>
              {[
                "Novo lead",
                "Contato realizado",
                "Interessado",
                "Proposta enviada",
                "Negociação",
                "Venda",
                "Perdido",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
            >
              <option value="">Todos</option>
              {state.salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contato a partir de
            <input
              type="date"
              value={contactDate}
              onChange={(e) => setContactDate(e.target.value)}
            />
          </label>
          <label>
            Ordenação
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {[
                ["name", "Nome"],
                ["rating", "Nota"],
                ["reviews", "Avaliações"],
                ["distance", "Distância da referência"],
                ["opportunity", "Oportunidade"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row-actions">
          <button
            className="secondary"
            onClick={() =>
              setFilters({
                ...filters,
                reviewMode: "lt",
                minimumReviews: 20,
                maximumReviews: null,
              })
            }
          >
            Menos de 20
          </button>
          <button
            className="secondary"
            onClick={() =>
              setFilters({
                ...filters,
                reviewMode: "range",
                minimumReviews: 20,
                maximumReviews: null,
              })
            }
          >
            20 ou mais
          </button>
          <button
            className="secondary"
            onClick={() =>
              setFilters({
                ...filters,
                reviewMode: "gt",
                minimumReviews: 100,
                maximumReviews: null,
              })
            }
          >
            Mais de 100
          </button>
          <button
            className="secondary"
            onClick={() => setFilters(initialPlacesFilters)}
          >
            Limpar filtros
          </button>
          <button className="secondary" onClick={() => setMap(!map)}>
            Mapa / rota desta lista
          </button>
        </div>
        <label className="route-choice">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          Apenas município confirmado pelos componentes do endereço
        </label>
        <p className="notice">
          {places.length} resultados únicos carregados · {visible.length} após
          os filtros ·{" "}
          {places.filter((p) => p.municipality === "different").length} de outro
          município excluídos ·{" "}
          {places.filter((p) => p.municipality === "unknown").length} sem
          município verificado. Campos opcionais são consultados ao pesquisar
          com seu filtro ativo ou ao abrir a ficha. Sem informação publicada não
          significa que o comércio não possui telefone/site/horários.
        </p>
        {!validation.success && (
          <p className="notice error">{validation.error.issues[0].message}</p>
        )}
      </section>
      {map && (
        <RoutePlanner
          points={[
            ...visible.map((p) => ({
              id: p.id,
              group: "Prospecção" as const,
              name: p.displayName.text,
              address: p.formattedAddress,
              place_id: p.id,
              latitude: p.location?.latitude,
              longitude: p.location?.longitude,
            })),
            ...state.companies
              .filter((c) => !visible.some((p) => p.id === c.place_id))
              .map((c) => ({
                id: c.id,
                group: c.is_customer
                  ? ("Clientes" as const)
                  : ("Leads" as const),
                name: c.name,
                address: c.address ? `${c.address}, ${c.city}` : undefined,
                place_id: c.place_id || undefined,
              })),
          ]}
        />
      )}
      <Table
        rows={visible}
        columns={[
          {
            key: "displayName",
            label: "Empresa",
            render: (p) => (
              <button
                className="text-button"
                onClick={async () => {
                  setSelected(p);
                  setMode("detail");
                  try {
                    const r = await fetch("/api/places", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        mode: "detail",
                        place_id: p.id,
                        city,
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    setSelected(d.place);
                    setPlaces((prev) =>
                      prev.map((x) =>
                        x.id === p.id
                          ? {
                              ...d.place,
                              distance: d.place.distance ?? x.distance,
                            }
                          : x,
                      ),
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {p.displayName.text}
              </button>
            ),
          },
          {
            key: "formattedAddress",
            label: "Endereço",
            render: (p) => (
              <span>
                {p.formattedAddress || "Não informado"}
                {p.municipality === "unknown" ? " · município a verificar" : ""}
              </span>
            ),
          },
          {
            key: "rating",
            label: "Nota",
            render: (p) =>
              p.rating === undefined ? "Não informado" : p.rating.toFixed(1),
          },
          {
            key: "userRatingCount",
            label: "Avaliações",
            render: (p) => p.userRatingCount ?? "Não informado",
          },
          {
            key: "nationalPhoneNumber",
            label: "Telefone",
            render: (p) =>
              p.nationalPhoneNumber ||
              (p.queried?.includes("phone")
                ? "Sem informação publicada"
                : "Não consultado"),
          },
          {
            key: "distance",
            label: "Distância",
            render: (p) =>
              p.distance === undefined
                ? "Sem referência"
                : p.distance.toFixed(1) + " km",
          },
        ]}
      />
      {nextPage && last && (
        <button
          className="primary"
          disabled={busy}
          onClick={() => search(last, true)}
        >
          Carregar próxima página
        </button>
      )}
      {synced && (
        <p className="google-attribution">
          Google Maps · Consulta em {new Date(synced).toLocaleString("pt-BR")}.{" "}
          {places
            .flatMap((p) => p.attributions || [])
            .map((a, i) => (
              <a key={i} href={a.providerUri} target="_blank" rel="noreferrer">
                {a.provider}{" "}
              </a>
            ))}
        </p>
      )}
      {selected && (
        <Dialog
          title="Ficha da oportunidade"
          close={() => setSelected(undefined)}
        >
          <h2>{selected.displayName.text}</h2>
          <p>{selected.formattedAddress}</p>
          <p>
            Nota: {selected.rating ?? "não informada"} · Avaliações:{" "}
            {selected.userRatingCount ?? "não informadas"}
          </p>
          <p>
            {selected.nationalPhoneNumber || "Telefone não publicado"} ·{" "}
            {selected.websiteUri || "Site não publicado"}
          </p>
          {selected.regularOpeningHours?.weekdayDescriptions?.map((h) => (
            <p key={h}>{h}</p>
          ))}
          <div className="row-actions">
            <a
              className="secondary"
              href={
                selected.googleMapsUri ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selected.displayName.text)}&query_place_id=${selected.id}`
              }
              target="_blank"
              rel="noreferrer"
            >
              Perfil Google / mapa
            </a>
            <button className="secondary" onClick={() => setMode("map")}>
              Mapa incorporado
            </button>
            <button className="primary" onClick={() => setMode("lead")}>
              Salvar lead
            </button>
            {company && (
              <button className="primary" onClick={() => setMode("sale")}>
                Registrar venda
              </button>
            )}
          </div>
          {mode === "map" && (
            <>
              <p className="muted">
                Requer chave Maps Embed distinta configurada; use o perfil
                Google se o mapa não carregar.
              </p>
              <iframe
                title="Google Maps"
                src={"/api/maps/embed?place=" + encodeURIComponent(selected.id)}
                referrerPolicy="strict-origin-when-cross-origin"
                style={{ width: "100%", height: 320, border: 0 }}
              />
            </>
          )}
          {company && mode !== "sale" && (
            <CompanyDetail
              company={company}
              state={state}
              mutate={mutate}
              edit={() => setMode("lead")}
              sell={() => setMode("sale")}
            />
          )}{" "}
          {mode === "sale" && company && (
            <QuickSaleForm
              state={state}
              mutate={mutate}
              companyId={company.id}
              close={() => setSelected(undefined)}
            />
          )}{" "}
          {!company && (
            <p className="notice">
              Salve o lead para registrar contato, resposta ou proposta. Isso
              não transforma o lead em cliente; a conversão ocorre ao registrar
              a venda.
            </p>
          )}
          {mode === "lead" && (
            <ActionForm
              action="company"
              mutate={mutate}
              close={() => setMode("detail")}
              extra={{
                id: company?.id,
                place_id: selected.id,
                is_customer: company?.is_customer || false,
                is_lead: true,
                status: company?.status || "Novo lead",
                origin: "Google",
              }}
              fields={[
                {
                  name: "name",
                  label: "Nome comercial confirmado",
                  value: company?.name || selected.displayName.text,
                  required: true,
                },
                {
                  name: "city",
                  label: "Cidade confirmada",
                  value: company?.city || city,
                  required: true,
                },
                {
                  name: "segment",
                  label: "Segmento confirmado",
                  value: company?.segment || "Outros",
                  required: true,
                },
                {
                  name: "phone",
                  label: "Telefone confirmado pela empresa",
                  value: company?.phone || "",
                },
                {
                  name: "address",
                  label: "Endereço confirmado",
                  value: company?.address || "",
                },
                {
                  name: "notes",
                  label: "Observações próprias",
                  type: "textarea",
                },
              ]}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
