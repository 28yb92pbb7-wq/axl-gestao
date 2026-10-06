"use client";
import { useState } from "react";
import { Search, ExternalLink, Plus, Star } from "lucide-react";
import {
  matchesPlace,
  placesFilterSchema,
  initialPlacesFilters,
  type PlacesFilters,
} from "@/lib/places";
import { opportunityScore } from "@/lib/domain";
import type { State } from "@/lib/types";
import { ActionForm, Badge, Dialog, Table, type Mutate } from "./ui";
type Place = {
  id: string;
  displayName: { text: string };
  formattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: { text: string };
  attributions?: { provider: string; providerUri: string }[];
};
export default function Prospecting({
  state,
  mutate,
}: {
  state: State;
  mutate: Mutate;
}) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Place>();
  const [synced, setSynced] = useState("");
  const [city, setCity] = useState("Valinhos");
  const [filters, setFilters] = useState<PlacesFilters>(initialPlacesFilters);
  const validation = placesFilterSchema.safeParse(filters);
  const [nextPage, setNextPage] = useState<string>();
  const [lastSearch, setLastSearch] =
    useState<Record<string, FormDataEntryValue>>();
  async function search(
    query: Record<string, FormDataEntryValue>,
    append = false,
  ) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...query,
          ...(append ? { page_token: nextPage } : {}),
        }),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setPlaces((previous) =>
        append
          ? [
              ...new Map(
                [...previous, ...result.places].map((p: Place) => [p.id, p]),
              ).values(),
            ]
          : result.places,
      );
      setNextPage(result.next_page_token);
      setSynced(result.synced_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível pesquisar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="notice">
        Pesquisa oficial Google Places, com cobrança conforme sua conta Google.
        Resultados ficam apenas na memória desta tela. O CRM preserva seus
        próprios dados e o identificador Google.
      </div>
      <section className="panel settings-card">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget));
            setPlaces([]);
            setNextPage(undefined);
            setLastSearch(f);
            await search(f);
          }}
        >
          <div className="form-grid">
            <label>
              Segmento / busca livre
              <input
                name="query"
                placeholder="Restaurantes, pet shops, salões…"
                required
              />
            </label>
            <label>
              Cidade
              <input
                name="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
              />
            </label>
            <label>
              Estado
              <input
                name="state"
                defaultValue="SP"
                maxLength={2}
                minLength={2}
                required
              />
            </label>
            <label>
              Bairro
              <input name="neighborhood" placeholder="Todos os bairros" />
            </label>
            <label>
              CEP
              <input name="postal_code" />
            </label>
          </div>
          <footer>
            <button className="primary" disabled={busy}>
              <Search size={16} />
              {busy ? "Consultando Google…" : "Buscar estabelecimentos"}
            </button>
          </footer>
        </form>
        {error && (
          <p className="notice warning" role="alert">
            {error}
          </p>
        )}
      </section>
      <section className="panel settings-card places-filters">
        <h2>Refinar resultados</h2>
        <div className="form-grid">
          <label>
            Nota mínima
            <input
              type="number"
              min="0"
              max="5"
              step="0.1"
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
              min="0"
              max="5"
              step="0.1"
              value={filters.maximum}
              onChange={(e) =>
                setFilters({ ...filters, maximum: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Mínimo de avaliações
            <input
              type="number"
              min="0"
              step="1"
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
            Máximo de avaliações
            <input
              type="number"
              min="0"
              step="1"
              placeholder="Sem limite"
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
          <label>
            Telefone
            <select
              value={filters.phone}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  phone: e.target.value as PlacesFilters["phone"],
                })
              }
            >
              <option value="">Todos</option>
              <option value="with">Com telefone</option>
              <option value="without">Sem telefone</option>
            </select>
          </label>
          <label>
            Site
            <select
              value={filters.website}
              onChange={(e) =>
                setFilters({
                  ...filters,
                  website: e.target.value as PlacesFilters["website"],
                })
              }
            >
              <option value="">Todos</option>
              <option value="with">Com site</option>
              <option value="without">Sem site</option>
            </select>
          </label>
        </div>
        {!validation.success && (
          <p role="alert" className="notice error">
            {validation.error.issues[0].message}
          </p>
        )}
        <div className="content-toolbar">
          <span className="muted">
            {validation.success
              ? places.filter((p) => matchesPlace(p, validation.data)).length
              : 0}{" "}
            resultados nos filtros · {places.length} estabelecimentos
            consultados
          </span>
          <button
            className="secondary"
            onClick={() => setFilters(initialPlacesFilters)}
          >
            Limpar filtros
          </button>
        </div>
        <p className="muted">
          Os filtros combinam nota e quantidade de avaliações dos resultados
          carregados. Cada página adicional é uma nova consulta Google; a lista
          não representa todos os comércios da cidade.
        </p>
      </section>
      <Table
        rows={places
          .filter((p) => validation.success && matchesPlace(p, validation.data))
          .map((p) => ({
            ...p,
            score: opportunityScore(
              {
                rating: p.rating,
                reviews: p.userRatingCount,
                phone: p.nationalPhoneNumber,
                website: p.websiteUri || "",
                segment: p.primaryTypeDisplayName?.text,
                contacted: state.companies.some((c) => c.place_id === p.id),
              },
              state.weights,
            ).score,
          }))}
        columns={[
          {
            key: "score",
            label: "AXL Score",
            render: (p) => <Badge>{p.score}</Badge>,
          },
          {
            key: "displayName",
            label: "Empresa",
            render: (p) => <strong>{p.displayName.text}</strong>,
          },
          { key: "formattedAddress", label: "Endereço" },
          {
            key: "rating",
            label: "Google",
            render: (p) => (
              <span>
                <Star size={13} /> {p.rating || "—"} · {p.userRatingCount || 0}{" "}
                avaliações
              </span>
            ),
          },
          { key: "nationalPhoneNumber", label: "Telefone" },
          {
            key: "id",
            label: "Ações",
            render: (p) => (
              <div className="row-actions">
                {p.googleMapsUri && (
                  <a
                    href={p.googleMapsUri}
                    rel="noreferrer"
                    target="_blank"
                    className="secondary small"
                  >
                    Maps
                    <ExternalLink size={12} />
                  </a>
                )}
                {p.websiteUri && (
                  <a
                    href={p.websiteUri}
                    target="_blank"
                    rel="noreferrer"
                    className="secondary small"
                  >
                    Site
                  </a>
                )}
                <button
                  className="primary small"
                  disabled={state.companies.some((c) => c.place_id === p.id)}
                  onClick={() => setSelected(p)}
                >
                  <Plus size={13} />
                  Lead
                </button>
              </div>
            ),
          },
        ]}
      />
      {nextPage && lastSearch && (
        <div className="content-toolbar">
          <button
            className="primary"
            disabled={busy}
            onClick={() => search(lastSearch, true)}
          >
            {busy ? "Consultando…" : "Carregar mais estabelecimentos"}
          </button>
        </div>
      )}
      {synced && (
        <p className="google-attribution">
          Google Maps · Consulta em{" "}
          {new Date(synced).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
          .{" "}
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
          title="Criar lead a partir desta oportunidade"
          close={() => setSelected(undefined)}
        >
          <p className="notice">
            Referência: {selected.displayName.text}. Informe os dados comerciais
            confirmados por você. A nota e os dados da consulta Google não serão
            armazenados permanentemente.
          </p>
          <ActionForm
            action="company"
            mutate={mutate}
            close={() => setSelected(undefined)}
            extra={{
              place_id: selected.id,
              is_customer: false,
              status: "Novo lead",
              origin: "Google",
            }}
            fields={[
              {
                name: "name",
                label: "Nome comercial confirmado",
                required: true,
              },
              {
                name: "city",
                label: "Cidade confirmada",
                value: city,
                required: true,
              },
              { name: "segment", label: "Segmento confirmado", required: true },
              {
                name: "phone",
                label: "Telefone obtido / confirmado com a empresa",
              },
              {
                name: "notes",
                label: "Observações próprias",
                type: "textarea",
              },
            ]}
          />
        </Dialog>
      )}
    </>
  );
}
