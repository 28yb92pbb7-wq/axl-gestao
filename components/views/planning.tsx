"use client";
import { Target } from "lucide-react";

import { money } from "@/lib/domain";
import type { State } from "@/lib/types";

import { Table } from "../ui";

export default function PlanningView({
  page,
  state,
  now,
  day,
  month,
  form,
}: {
  page: string;
  state: State;
  now: Date;
  day: string;
  month: string;
  form: (kind: string, id?: string, companyId?: string) => void;
}) {
  return (
    <>
      {page === "Metas" && (
        <div className="goal-grid">
          {state.goals.map((g) => {
            const weekDate = new Date(now);
            weekDate.setDate(
              weekDate.getDate() - ((weekDate.getDay() + 6) % 7),
            );
            const weekStart = weekDate.toISOString().slice(0, 10);
            const achieved = state.sales
              .filter((s) =>
                g.period === "Diária"
                  ? s.date === day
                  : g.period === "Semanal"
                    ? s.date >= weekStart && s.date <= day
                    : s.date.slice(0, 7) === month,
              )
              .reduce((s, v) => s + v.total, 0);
            return (
              <section className="panel goal-card" key={g.id}>
                <Target size={28} />
                <h2>Meta {g.period.toLowerCase()}</h2>
                <h3>
                  {money(achieved)} <small>/ {money(g.amount)}</small>
                </h3>
                <div className="progress">
                  <i
                    style={{
                      width: Math.min(100, (achieved / g.amount) * 100) + "%",
                    }}
                  />
                </div>
                <p>
                  {((achieved / g.amount) * 100).toLocaleString("pt-BR", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                  % atingido
                </p>
                <button
                  className="secondary"
                  onClick={() => form("goal", g.id)}
                >
                  Editar meta
                </button>
              </section>
            );
          })}
        </div>
      )}
      {page === "Vendedores" && (
        <Table
          rows={state.salespeople}
          filename="vendedores"
          columns={[
            { key: "name", label: "Vendedor" },
            { key: "city", label: "Cidade" },
            { key: "email", label: "E-mail" },
            {
              key: "id",
              label: "Faturamento",
              render: (v) =>
                money(
                  state.sales
                    .filter((s) => s.salesperson_id === v.id)
                    .reduce((n, s) => n + s.total, 0),
                ),
            },
            {
              key: "commission_value",
              label: "Comissão acumulada",
              render: (v) =>
                money(
                  state.sales
                    .filter((s) => s.salesperson_id === v.id)
                    .reduce((n, s) => n + s.commission, 0),
                ),
            },
            {
              key: "commission_type",
              label: "Regra",
              render: (v) =>
                v.commission_type === "plate"
                  ? money(v.commission_value) + " / placa"
                  : v.commission_value +
                    "% " +
                    (v.commission_type === "margin"
                      ? "sobre lucro"
                      : "sobre venda"),
            },
          ]}
        />
      )}
    </>
  );
}
