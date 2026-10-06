"use client";

import { money, dateBR } from "@/lib/domain";
import type { State } from "@/lib/types";

import { Badge, Table } from "../ui";
import { Metric } from "./shared";
export default function FinanceView({
  page,
  state,
  totalBalance,
  form,
}: {
  page: string;
  state: State;
  totalBalance: number;
  form: (kind: string, id?: string, companyId?: string) => void;
}) {
  return (
    <>
      {page === "Financeiro" && (
        <>
          <div className="metrics">
            <Metric
              label="Faturado (acumulado)"
              value={money(state.sales.reduce((s, v) => s + v.total, 0))}
            />
            <Metric
              label="Recebido (acumulado)"
              value={money(state.sales.reduce((s, v) => s + v.paid, 0))}
            />
            <Metric label="A receber" value={money(totalBalance)} />
            <Metric
              label="Saldo de caixa"
              value={money(
                state.sales.reduce((s, v) => s + v.paid, 0) -
                  state.expenses
                    .filter((e) => e.paid)
                    .reduce((s, e) => s + e.amount, 0),
              )}
              note="Recebimentos menos despesas pagas"
            />
          </div>
          <h2>Contas a receber</h2>
          <Table
            rows={state.sales.filter((s) => s.paid < s.total)}
            filename="contas-a-receber"
            columns={[
              { key: "number", label: "Venda", render: (s) => `#${s.number}` },
              { key: "company_name", label: "Cliente" },
              {
                key: "due_date",
                label: "Vencimento",
                render: (s) => dateBR(s.due_date),
              },
              {
                key: "total",
                label: "Saldo",
                render: (s) => money(s.total - s.paid),
              },
              {
                key: "id",
                label: "Ação",
                render: (s) => (
                  <button
                    className="primary small"
                    onClick={() => form("payment", s.id)}
                  >
                    Registrar pagamento
                  </button>
                ),
              },
            ]}
          />
          <h2 className="section-spacer">Despesas</h2>
          <Table
            rows={state.expenses}
            filename="despesas"
            columns={[
              { key: "description", label: "Descrição" },
              { key: "category", label: "Categoria" },
              { key: "amount", label: "Valor", render: (e) => money(e.amount) },
              { key: "date", label: "Data", render: (e) => dateBR(e.date) },
              {
                key: "paid",
                label: "Situação",
                render: (e) => (
                  <Badge tone={e.paid ? "green" : "amber"}>
                    {e.paid ? "Pago" : "Pendente"}
                  </Badge>
                ),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
