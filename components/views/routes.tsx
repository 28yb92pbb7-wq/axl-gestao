"use client";
import RoutePlanner from "../route-planner";
import { ArrowUpRight } from "lucide-react";

import { dateBR } from "@/lib/domain";
import type { State } from "@/lib/types";

import { Empty, type Mutate } from "../ui";
import { PanelHeading } from "./shared";
export default function RoutesView({
  page,
  state,
  form,
  mutate,
  setError,
}: {
  page: string;
  state: State;
  form: (kind: string, id?: string, companyId?: string) => void;
  mutate: Mutate;
  setError: (error: string) => void;
}) {
  return (
    <>
      {page === "Visitas / Rotas" && (
        <>
          <RoutePlanner
            points={state.companies.map((c) => ({
              id: c.id,
              group: c.is_customer ? "Clientes" : "Leads",
              name: c.name,
              address: c.address ? `${c.address}, ${c.city}` : undefined,
              place_id: c.place_id || undefined,
            }))}
          />
          <div className="notice">
            Rotas manuais com ordem de visita definida na seleção. A navegação
            abre externamente no Google Maps.
          </div>
          {state.routes.length === 0 ? (
            <section className="panel">
              <Empty text="Crie sua primeira rota de visitas." />
            </section>
          ) : (
            state.routes.map((r) => (
              <section className="panel route-card" key={r.id}>
                <PanelHeading
                  title={r.name}
                  subtitle={`${dateBR(r.date)} · ${state.salespeople.find((s) => s.id === r.salesperson_id)?.name || "Equipe AXL"}`}
                />
                {state.stops
                  .filter((s) => s.route_id === r.id)
                  .map((s, index) => (
                    <div className="list-item" key={s.id}>
                      <span className="rank">{index + 1}</span>
                      <button
                        className="text-button"
                        onClick={() => form("detail", s.company_id)}
                      >
                        <strong>{s.name}</strong>
                        <small>{s.address || s.city}</small>
                      </button>
                      <select
                        aria-label={`Status da visita ${s.name}`}
                        value={s.status}
                        onChange={(e) =>
                          mutate("stop", {
                            id: s.id,
                            status: e.target.value,
                          }).catch((e) => setError(e.message))
                        }
                      >
                        {[
                          "Pendente",
                          "Visitado",
                          "Não encontrado",
                          "Interessado",
                          "Retornar depois",
                          "Venda realizada",
                        ].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                      <a
                        className="secondary small"
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + " " + s.address + " " + s.city)}`}
                      >
                        Navegar
                        <ArrowUpRight size={14} />
                      </a>
                    </div>
                  ))}
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}
