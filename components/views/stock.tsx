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
            <button className="primary" onClick={() => form("purchase")}>
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
                    {i.quantity} {i.unit}
                  </strong>
                ),
              },
              { key: "minimum", label: "Mínimo" },
              {
                key: "cost",
                label: "Custo médio",
                render: (i) => money(i.cost),
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
                  <button
                    className="secondary small"
                    onClick={() => form("stock", i.id)}
                  >
                    Movimentar
                  </button>
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
