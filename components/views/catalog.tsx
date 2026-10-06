"use client";
import { costKnown, paymentKnown, saleDate } from "@/lib/history";
import { Radio } from "lucide-react";

import { money } from "@/lib/domain";
import type { State } from "@/lib/types";

import { Badge, Table } from "../ui";

export default function CatalogView({
  page,
  state,
  form,
  day,
}: {
  page: string;
  state: State;
  form: (kind: string, id?: string, companyId?: string) => void;
  day: string;
}) {
  return (
    <>
      {page === "Vendas" && (
        <Table
          rows={state.sales.map((s) => ({
            ...s,
            date_display: saleDate(s),
            profit_display: costKnown(s)
              ? money(s.profit) +
                (s.cost_status === "estimated" ? " · estimado" : "")
              : "Não informado",
            payment_status: !paymentKnown(s)
              ? "Não informado"
              : s.paid >= s.total
                ? "Pago"
                : s.due_date && s.due_date < day
                  ? "Vencido"
                  : s.paid
                    ? "Parcial"
                    : "Pendente",
          }))}
          filename="vendas"
          onRow={(s) => form("sale-detail", s.id)}
          columns={[
            {
              key: "number",
              label: "Venda",
              render: (s) => (
                <strong>#{String(s.number).padStart(4, "0")}</strong>
              ),
            },
            { key: "company_name", label: "Cliente" },
            { key: "date_display", label: "Data" },
            { key: "total", label: "Valor", render: (s) => money(s.total) },
            {
              key: "profit_display",
              label: "Resultado bruto parcial",
            },
            { key: "plates", label: "Placas" },
            {
              key: "payment_status",
              label: "Pagamento",
              render: (s) => (
                <Badge
                  tone={
                    !paymentKnown(s)
                      ? "neutral"
                      : s.paid >= s.total
                        ? "green"
                        : s.due_date < day
                          ? "red"
                          : "amber"
                  }
                >
                  {!paymentKnown(s)
                    ? "Não informado"
                    : s.paid >= s.total
                      ? "Pago"
                      : s.due_date < day
                        ? "Vencido"
                        : s.paid
                          ? "Parcial"
                          : "Pendente"}
                </Badge>
              ),
            },
            {
              key: "id",
              label: "Ação",
              render: (s) => (
                <button
                  className="secondary small"
                  disabled={paymentKnown(s) && s.paid >= s.total}
                  onClick={() => form("payment_set", s.id)}
                >
                  Receber
                </button>
              ),
            },
          ]}
        />
      )}
      {page === "Produtos" && (
        <Table
          rows={state.products.map((p) => ({
            ...p,
            computedCost: state.components.some((c) => c.product_id === p.id)
              ? Math.round(
                  state.components
                    .filter((c) => c.product_id === p.id)
                    .reduce(
                      (s, c) =>
                        s +
                        c.quantity *
                          (state.inventory.find((i) => i.id === c.inventory_id)
                            ?.cost || 0),
                      0,
                    ),
                )
              : p.cost,
          }))}
          filename="produtos"
          onRow={(p) => form("product", p.id)}
          columns={[
            {
              key: "name",
              label: "Produto",
              render: (p) => (
                <div className="company-cell">
                  <span className="product-icon">
                    <Radio size={19} />
                  </span>
                  <div>
                    <strong>{p.name}</strong>
                    <small>{p.sku}</small>
                  </div>
                </div>
              ),
            },
            { key: "category", label: "Categoria" },
            {
              key: "price",
              label: "Preço",
              render: (p) =>
                p.category === "Histórico importado" && !p.active
                  ? "Preço variável (histórico)"
                  : money(p.price),
            },
            {
              key: "computedCost",
              label: "Custo atual",
              render: (p) =>
                p.cost_known === 0 ? "Não informado" : money(p.computedCost),
            },
            {
              key: "id",
              label: "Margem",
              render: (p) =>
                p.cost_known === 0
                  ? "Não informado"
                  : `${p.price ? (((p.price - p.computedCost) / p.price) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : 0}%`,
            },
            {
              key: "active",
              label: "Status",
              render: (p) => (
                <Badge tone={p.active ? "green" : "neutral"}>
                  {p.active ? "Ativo" : "Inativo"}
                </Badge>
              ),
            },
            {
              key: "sku",
              label: "Ações",
              render: (p) => (
                <button
                  className="secondary small"
                  onClick={() => form("product", p.id)}
                >
                  Editar
                </button>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
