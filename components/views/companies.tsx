"use client";
import { useState } from "react";
import MapsImportForm from "../maps-import-form";
import { Dialog } from "../ui";
import { ArrowUpRight } from "lucide-react";

import { stages } from "@/lib/domain";
import type { Company, State } from "@/lib/types";

import { Badge, Table, type Mutate } from "../ui";

export default function CompaniesView({
  page,
  pipeline,
  setPipeline,
  filter,
  setFilter,
  filteredCompanies,
  state,
  form,
  mutate,
  setError,
}: {
  page: string;
  pipeline: boolean;
  setPipeline: (value: boolean) => void;
  filter: string;
  setFilter: (value: string) => void;
  filteredCompanies: Company[];
  state: State;
  form: (kind: string, id?: string, companyId?: string) => void;
  mutate: Mutate;
  setError: (error: string) => void;
}) {
  const [maps, setMaps] = useState(false);
  return (
    <>
      {(page === "Clientes" || page === "Leads") && (
        <button className="primary" onClick={() => setMaps(true)}>
          Adicionar pelo Google Maps
        </button>
      )}
      {maps && (
        <Dialog title="Adicionar pelo Google Maps" close={() => setMaps(false)}>
          <MapsImportForm
            state={state}
            mutate={mutate}
            onSaved={(id) => {
              setMaps(false);
              form("detail", id);
            }}
          />
        </Dialog>
      )}
      {(page === "Clientes" || page === "Leads") && (
        <>
          <div className="content-toolbar">
            <div className="tabs">
              {page === "Leads" && (
                <>
                  <button
                    className={pipeline ? "active" : ""}
                    onClick={() => setPipeline(true)}
                  >
                    Pipeline
                  </button>
                  <button
                    className={!pipeline ? "active" : ""}
                    onClick={() => setPipeline(false)}
                  >
                    Tabela
                  </button>
                </>
              )}
            </div>
            <select
              aria-label="Filtrar etapa"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">Todas as etapas</option>
              {stages.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          {page === "Leads" && pipeline ? (
            <div className="kanban">
              {stages.map((stage) => (
                <section className="kanban-column" key={stage}>
                  <h3>
                    <i />
                    {stage}
                    <span>
                      {
                        filteredCompanies.filter((c) => c.status === stage)
                          .length
                      }
                    </span>
                  </h3>
                  {filteredCompanies
                    .filter((c) => c.status === stage)
                    .map((c) => (
                      <article className="kanban-card" key={c.id}>
                        <button
                          className="text-button"
                          onClick={() => form("detail", c.id)}
                        >
                          <strong>{c.name}</strong>
                          <small>
                            {c.segment} · {c.city}
                          </small>
                        </button>
                        <select
                          aria-label={`Etapa de ${c.name}`}
                          value={c.status}
                          onChange={(e) => {
                            if (e.target.value === "Perdido") {
                              form("lost", c.id);
                              return;
                            }
                            mutate("stage", {
                              id: c.id,
                              status: e.target.value,
                            }).catch((e) => setError(e.message));
                          }}
                        >
                          {stages.map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        <span className="muted">
                          {state.salespeople.find(
                            (s) => s.id === c.salesperson_id,
                          )?.name || "Sem responsável"}
                        </span>
                      </article>
                    ))}
                  {!filteredCompanies.some((c) => c.status === stage) && (
                    <div className="kanban-empty">Sem leads nesta etapa</div>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <Table
              rows={filteredCompanies}
              filename={page.toLowerCase()}
              onRow={(c) => form("detail", c.id)}
              columns={[
                {
                  key: "name",
                  label: "Empresa",
                  render: (c) => (
                    <div className="company-cell">
                      <span className="avatar colored">
                        {c.name.slice(0, 2).toUpperCase()}
                      </span>
                      <div>
                        <strong>{c.name}</strong>
                        <small>{c.contact || c.segment}</small>
                      </div>
                    </div>
                  ),
                },
                { key: "city", label: "Cidade" },
                { key: "segment", label: "Segmento" },
                { key: "phone", label: "Telefone" },
                {
                  key: "status",
                  label: "Status",
                  render: (c) => <Badge>{c.status}</Badge>,
                },
                { key: "origin", label: "Origem" },
                {
                  key: "id",
                  label: "Ações",
                  render: (c) => (
                    <button
                      className="secondary small"
                      onClick={() => form("detail", c.id)}
                    >
                      Abrir ficha
                      <ArrowUpRight size={13} />
                    </button>
                  ),
                },
              ]}
            />
          )}
        </>
      )}
    </>
  );
}
