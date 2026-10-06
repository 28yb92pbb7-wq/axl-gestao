"use client";
import { useState, useEffect } from "react";
import {
  matchesPlace,
  initialPlacesFilters,
  placesFilterSchema,
  type PlacesFilters,
} from "@/lib/places";
import type { State } from "@/lib/types";
import type { GooglePlace } from "@/lib/google-places";
import { stages } from "@/lib/domain";
import { Table, Dialog, type Mutate } from "./ui";
import MapsImportForm from "./maps-import-form";
import CompanyDetail from "./company-detail";
import QuickSaleForm from "./quick-sale-form";
export default function Prospecting({
  state,
  mutate,
}: {
  state: State;
  mutate: Mutate;
}) {
  const [add, setAdd] = useState(false),
    [id, setId] = useState(""),
    [sale, setSale] = useState(false),
    [city, setCity] = useState(""),
    [segment, setSegment] = useState(""),
    [neighborhood, setNeighborhood] = useState(""),
    [status, setStatus] = useState(""),
    [owner, setOwner] = useState(""),
    [contact, setContact] = useState(""),
    [after, setAfter] = useState(""),
    [before, setBefore] = useState(""),
    [sort, setSort] = useState("name"),
    [message, setMessage] = useState("");
  const [filters, setFilters] = useState<PlacesFilters>(initialPlacesFilters);
  const [provider, setProvider] = useState<
    Record<string, { place: GooglePlace; expires: number }>
  >({});
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const company = state.companies.find((c) => c.id === id);
  async function update(companyId: string) {
    const c = state.companies.find((c) => c.id === companyId);
    const link = state.mapLinks?.find((m) => m.company_id === companyId);
    if (!link) {
      setMessage("Adicione um link do Google Maps para consultar os dados.");
      return;
    }
    try {
      const r = await fetch("/api/maps/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: link.url, name: c?.name, city: c?.city }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const candidate = d.candidates?.find(
        (x: { place: GooglePlace }) => x.place.id === c?.place_id,
      );
      if (candidate)
        setProvider((p) => ({
          ...p,
          [companyId]: { place: candidate.place, expires: Date.now() + 900000 },
        }));
      else {
        setAdd(true);
        setMessage(
          "Abra o importador para confirmar a empresa correta. " +
            (d.message || ""),
        );
      }
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  const get = (id: string) =>
    provider[id]?.expires > now ? provider[id].place : {};
  const validation = placesFilterSchema.safeParse(filters);
  const rows = state.companies
    .filter((c) => {
      const events =
        state.contacts?.filter(
          (x) => x.company_id === c.id && x.type !== "WhatsApp aberto",
        ) || [];
      const latest =
        events
          .map((x) => x.created_at.slice(0, 10))
          .sort()
          .at(-1) || "";
      return (
        (!city || c.city === city) &&
        (!segment || c.segment === segment) &&
        (!neighborhood ||
          c.neighborhood.toLowerCase().includes(neighborhood.toLowerCase())) &&
        (!status || c.status === status) &&
        (!owner || c.salesperson_id === owner) &&
        (!contact ||
          (contact === "yes" ? events.length > 0 : events.length === 0)) &&
        (!after || latest >= after) &&
        (!before || (!!latest && latest <= before)) &&
        validation.success &&
        matchesPlace(
          {
            ...get(c.id),
            nationalPhoneNumber:
              c.phone || (get(c.id) as GooglePlace).nationalPhoneNumber,
          },
          filters,
        )
      );
    })
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : Number(
            (get(b.id) as GooglePlace)[sort as "rating" | "userRatingCount"] ??
              -1,
          ) -
          Number(
            (get(a.id) as GooglePlace)[sort as "rating" | "userRatingCount"] ??
              -1,
          ),
    );
  return (
    <>
      <section className="panel settings-card">
        <h3>Filtrar minhas empresas</h3>
        <button className="primary" onClick={() => setAdd(true)}>
          Adicionar pelo Google Maps
        </button>
        <p>
          Pesquise no Google Maps e cole o link aqui. Os filtros abaixo se
          aplicam apenas às empresas cadastradas.
        </p>
        <div className="form-grid">
          <label>
            Cidade
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">Todas</option>
              {[
                ...new Set(state.companies.map((c) => c.city).filter(Boolean)),
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Segmento
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
            >
              <option value="">Todos</option>
              {[...new Set(state.companies.map((c) => c.segment))].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Bairro
            <input
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
            />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Responsável
            <select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Todos</option>
              {state.salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contato
            <select
              value={contact}
              onChange={(e) => setContact(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="yes">Já contatado</option>
              <option value="no">Nunca contatado</option>
            </select>
          </label>
          <label>
            Último contato desde
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
            />
          </label>
          <label>
            Nota
            <select
              value={filters.ratingMode}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  ratingMode: e.target.value as PlacesFilters["ratingMode"],
                })
              }
            >
              <option value="range">Mínima / máxima / intervalo</option>
              <option value="eq">Igual</option>
              <option value="unknown">Não disponível</option>
            </select>
          </label>
          <label>
            Nota mínima ou igual
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={filters.minimum}
              onChange={(e) =>
                setFilters({ ...filters, minimum: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Nota máxima
            <input
              type="number"
              min={0}
              max={5}
              step={0.1}
              value={filters.maximum}
              onChange={(e) =>
                setFilters({ ...filters, maximum: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Avaliações
            <select
              value={filters.reviewMode}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  reviewMode: e.target.value as PlacesFilters["reviewMode"],
                })
              }
            >
              <option value="range">Intervalo / mínimo</option>
              <option value="lt">Menor que</option>
              <option value="gt">Maior que</option>
              <option value="eq">Igual</option>
              <option value="unknown">Não disponível</option>
            </select>
          </label>
          <label>
            Quantidade mínima / limite
            <input
              type="number"
              min={0}
              step={1}
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
            Quantidade máxima
            <input
              type="number"
              min={0}
              step={1}
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
                <option value="with">Informação disponível</option>
                <option value="without">Ausência verificada na consulta</option>
                <option value="unknown">Não verificado</option>
              </select>
            </label>
          ))}
          <label>
            Ordenar
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Nome</option>
              <option value="rating">Nota</option>
              <option value="userRatingCount">Avaliações</option>
            </select>
          </label>
        </div>
        <div className="row-actions">
          <button
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
            onClick={() => {
              setFilters(initialPlacesFilters);
              setCity("");
              setSegment("");
              setNeighborhood("");
              setStatus("");
              setOwner("");
              setContact("");
              setAfter("");
              setBefore("");
            }}
          >
            Limpar filtros
          </button>
        </div>
        <p>
          {rows.length} de {state.companies.length} empresas. Nota e avaliações
          requerem consulta atual; dados Google expiram nesta sessão em 15
          minutos. Campos próprios permanecem no CRM.
        </p>
        {!validation.success && (
          <p className="notice error">{validation.error.issues[0].message}</p>
        )}
        {message && <p className="notice">{message}</p>}
      </section>
      <Table
        rows={rows}
        onRow={(c) => {
          setId(c.id);
          setSale(false);
        }}
        columns={[
          { key: "name", label: "Empresa" },
          { key: "city", label: "Cidade" },
          { key: "segment", label: "Segmento" },
          { key: "status", label: "Etapa" },
          {
            key: "id",
            label: "Nota / avaliações",
            render: (c) => {
              const p = get(c.id) as GooglePlace;
              return `${p.rating ?? "Não disponível"} / ${p.userRatingCount ?? "Não disponível"}`;
            },
          },
          {
            key: "id",
            label: "Google",
            render: (c) => (
              <button
                className="text-button"
                onClick={(e) => {
                  e.stopPropagation();
                  update(c.id);
                }}
              >
                Atualizar dados
              </button>
            ),
          },
        ]}
      />
      <p className="google-attribution">
        Google Maps · notas, avaliações e dados do provedor somente da consulta
        atual.{" "}
        <button
          className="text-button"
          onClick={async () => {
            for (const c of rows.filter((c) => c.place_id).slice(0, 8))
              await update(c.id);
          }}
        >
          Atualizar até 8 empresas desta lista
        </button>
      </p>
      {!state.companies.length && (
        <p>Adicione uma empresa pelo link do Google Maps.</p>
      )}
      {add && (
        <Dialog title="Adicionar pelo Google Maps" close={() => setAdd(false)}>
          <MapsImportForm
            state={state}
            mutate={mutate}
            onSaved={(id, place) => {
              if (place)
                setProvider((p) => ({
                  ...p,
                  [id]: { place, expires: Date.now() + 900000 },
                }));
              setAdd(false);
              setId(id);
            }}
          />
        </Dialog>
      )}
      {company && (
        <Dialog title="Ficha da empresa" close={() => setId("")}>
          {sale ? (
            <QuickSaleForm
              state={state}
              mutate={mutate}
              companyId={company.id}
              close={() => setSale(false)}
            />
          ) : (
            <CompanyDetail
              company={company}
              state={state}
              mutate={mutate}
              edit={() => setAdd(true)}
              sell={() => setSale(true)}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
