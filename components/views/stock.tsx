"use client";
import { Plus } from "lucide-react";

import { money, dateBR } from "@/lib/domain";
import type { Inventory, State } from "@/lib/types";

import { Badge, Table } from "../ui";

export default function StockView({
  page,
  state,
  inventoryLow,
  form,
}: {
  page: string;
  state: State;
  inventoryLow: Inventory[];
  form: (kind: string, id?: string, companyId?: string) => void;
}) {
  return (
    <>
      {page === "Estoque" && (
        <>
          {inventoryLow.length > 0 && (
            <div className="notice warning">
              Estoque no mínimo ou abaixo:{" "}
              {inventoryLow.map((i) => i.name).join(", ")}.
            </div>
          )}
          <div className="content-toolbar">
            <h2>Matéria-prima</h2>
            <button className="secondary" onClick={() => form("inventory")}>
              Novo material
            </button>
            <button className="primary" onClick={() => form("lot_purchase")}>
              <Plus size={16} />
              Registrar compra
            </button>
          </div>
          <Table
            rows={state.inventory}
            filename="estoque"
            columns={[
              { key: "name", label: "Material" },
              {
                key: "quantity",
                label: "Estoque atual",
                render: (i) => (
                  <strong>
                    {i.quantity_known === 0
                      ? "A conferir"
                      : `${i.quantity} ${i.unit}`}
                  </strong>
                ),
              },
              {
                key: "quantity_known",
                label: "Reservado / disponível",
                render: (i) => {
                  const r = (state.reservations || [])
                    .filter(
                      (r) => r.inventory_id === i.id && r.status === "reserved",
                    )
                    .reduce((s, r) => s + r.quantity, 0);
                  return i.quantity_known === 0
                    ? "A conferir"
                    : `${r} / ${i.quantity - r}`;
                },
              },
              { key: "minimum", label: "Mínimo" },
              {
                key: "cost",
                label: "Custo médio",
                render: (i) =>
                  i.cost_status === "unknown"
                    ? "Não informado"
                    : money(i.cost) +
                      (i.cost_status === "estimated" ? " · estimado" : ""),
              },
              { key: "supplier", label: "Fornecedor" },
              {
                key: "id",
                label: "Situação",
                render: (i) => (
                  <Badge tone={i.quantity <= i.minimum ? "amber" : "green"}>
                    {i.quantity <= i.minimum
                      ? "Reposição necessária"
                      : "Em dia"}
                  </Badge>
                ),
              },
              {
                key: "unit",
                label: "Ação",
                render: (i) => (
                  <div className="row-actions">
                    <button
                      className="secondary small"
                      onClick={() => form("stock_count", i.id)}
                    >
                      Contagem física
                    </button>
                    <button
                      className="secondary small"
                      onClick={() => form("material_cost", i.id)}
                    >
                      Revisar custo
                    </button>
                  </div>
                ),
              },
            ]}
          />
          <h2 className="section-spacer">Lotes e compras</h2>
          <p className="notice">
            Os seis lotes históricos são referências para revisão, sem entradas
            de estoque ou caixa. NFC-03 estava pendente em 20/09/2026; a
            situação atual precisa ser confirmada. Não derive o estoque atual
            pelas 91 placas vendidas.
          </p>
          <Table
            rows={state.lots || []}
            columns={[
              { key: "code", label: "Lote" },
              {
                key: "inventory_id",
                label: "Material",
                render: (l) =>
                  state.inventory.find((i) => i.id === l.inventory_id)?.name,
              },
              { key: "quantity", label: "Comprado" },
              { key: "received", label: "Recebido" },
              {
                key: "unit_cost",
                label: "Unitário com frete",
                render: (l) => money(l.unit_cost),
              },
              {
                key: "amount",
                label: "Total material",
                render: (l) => money(l.amount),
              },
              {
                key: "receipt_status",
                label: "Situação",
                render: (l) =>
                  l.receipt_status === "historical_review"
                    ? "Histórico a revisar"
                    : `${l.quantity - l.received} em trânsito`,
              },
              {
                key: "paid",
                label: "Pago",
                render: (l) => (l.paid_known ? money(l.paid) : "Não informado"),
              },
              {
                key: "id",
                label: "Ações",
                render: (l) =>
                  l.receipt_status === "historical_review" ? (
                    <button
                      className="secondary"
                      onClick={() => form("lot_review", l.id)}
                    >
                      Conferir referência atual
                    </button>
                  ) : (
                    <div className="row-actions">
                      <button
                        className="secondary"
                        onClick={() => form("lot_receive", l.id)}
                      >
                        Receber parcialmente
                      </button>
                      <button
                        className="secondary"
                        onClick={() => form("lot_payment", l.id)}
                      >
                        Registrar pagamento
                      </button>
                    </div>
                  ),
              },
            ]}
          />
          <h2 className="section-spacer">Histórico de movimentações</h2>
          <Table
            rows={state.movements}
            columns={[
              { key: "name", label: "Material" },
              { key: "type", label: "Tipo" },
              { key: "quantity", label: "Quantidade" },
              { key: "description", label: "Descrição" },
              {
                key: "created_at",
                label: "Data",
                render: (m) => dateBR(m.created_at + "Z"),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
