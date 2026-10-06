"use client";

import { dateBR, orderStages } from "@/lib/domain";
import type { State } from "@/lib/types";

import { type Mutate } from "../ui";

export default function OrdersView({
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
      {(page === "Pedidos" || page === "Produção") && (
        <>
          <div className="notice">
            Avance a arte até a aprovação. Em Produção, use “Marcar produzido”
            para baixar os materiais uma única vez.
          </div>
          <div className="kanban">
            {(page === "Produção"
              ? ["Arte aprovada", "Produção", "Pronto para entrega"]
              : orderStages
            ).map((stage) => (
              <section className="kanban-column" key={stage}>
                <h3>
                  <i />
                  {stage}
                  <span>
                    {state.orders.filter((o) => o.status === stage).length}
                  </span>
                </h3>
                {state.orders
                  .filter((o) => o.status === stage)
                  .map((o) => (
                    <article className="kanban-card" key={o.id}>
                      <small className="muted">
                        PEDIDO #{String(o.number).padStart(4, "0")}
                      </small>
                      <h4>{o.company_name}</h4>
                      <p>
                        {o.promised_date
                          ? "Entrega: " + dateBR(o.promised_date)
                          : "Prazo não definido"}
                      </p>
                      <button
                        className="secondary small"
                        onClick={() => form("order", o.id)}
                      >
                        Atualizar pedido
                      </button>
                      {["Arte aprovada", "Produção"].includes(o.status) && (
                        <button
                          className="primary small"
                          onClick={() => {
                            if (
                              confirm(
                                "Confirmar produção e baixa dos materiais deste pedido?",
                              )
                            )
                              mutate("produce", { id: o.id }).catch((e) =>
                                setError(e.message),
                              );
                          }}
                        >
                          Marcar produzido
                        </button>
                      )}
                    </article>
                  ))}
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
