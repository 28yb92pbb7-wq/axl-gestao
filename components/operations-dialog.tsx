"use client";
import OrderItemsEditor from "./order-items-editor";
import type { State } from "@/lib/types";
import { today, orderStages, money } from "@/lib/domain";
import { ActionForm, type Field, type Mutate } from "./ui";
import type { Modal } from "./entity-dialog";
export default function OperationsDialog({
  modal,
  state,
  mutate,
  close,
}: {
  modal: Modal;
  state: State;
  mutate: Mutate;
  close: () => void;
}) {
  const id = modal.id;
  const order = state.orders.find((o) => o.id === id);
  const sale = state.sales.find((s) => s.id === id);
  const lot = state.lots?.find((l) => l.id === id);
  const action = modal.kind;
  let fields: Field[] = [];
  let extra: Record<string, unknown> = { id };
  const materials = state.inventory.map((i) => ({
    value: i.id,
    label: i.name,
  }));
  if (action === "stock_count")
    fields = [
      {
        name: "quantity",
        label: "Quantidade contada fisicamente",
        type: "number",
        required: true,
      },
      {
        name: "date",
        label: "Data da contagem",
        type: "date",
        value: today(),
        required: true,
      },
      {
        name: "notes",
        label: "Responsável / motivo da diferença",
        type: "textarea",
        required: true,
      },
      {
        name: "initial",
        label: "Confirmar saldo físico inicial",
        type: "checkbox",
      },
    ];
  if (action === "material_cost")
    fields = [
      {
        name: "cost",
        label: "Custo unitário (R$)",
        type: "money",
        required: true,
      },
      {
        name: "status",
        label: "Situação do custo",
        type: "select",
        options: [
          { value: "confirmed", label: "Confirmado" },
          { value: "estimated", label: "Estimado" },
          { value: "unknown", label: "Não informado" },
        ],
      },
      { name: "origin", label: "Origem do custo", required: true },
    ];
  if (action === "lot_purchase") {
    extra = {};
    fields = [
      {
        name: "inventory_id",
        label: "Material",
        type: "select",
        options: materials,
      },
      { name: "code", label: "Código único do lote", required: true },
      {
        name: "quantity",
        label: "Quantidade comprada",
        type: "number",
        required: true,
      },
      {
        name: "amount",
        label: "Valor total do material (R$)",
        type: "money",
        required: true,
      },
      { name: "freight", label: "Frete (R$)", type: "money", value: 0 },
      {
        name: "received",
        label: "Quantidade recebida agora (0 = nenhuma)",
        type: "number",
        value: 0,
      },
      {
        name: "date",
        label: "Data da compra / pagamento (opcional)",
        type: "date",
        nullable: true,
      },
      { name: "supplier", label: "Fornecedor (opcional)" },
      {
        name: "paid",
        label: "Valor pago confirmado (R$, vazio = desconhecido)",
        type: "money",
        nullable: true,
      },
      { name: "notes", label: "Observações", type: "textarea" },
    ];
  }
  if (action === "lot_review")
    fields = [
      {
        name: "current_received",
        label: "Total deste lote já recebido até a conferência",
        type: "number",
        required: true,
      },
      {
        name: "date",
        label: "Data da conferência",
        type: "date",
        value: today(),
        required: true,
      },
      {
        name: "notes",
        label: "Evidência / responsável / divergências",
        type: "textarea",
        required: true,
      },
    ];
  if (action === "lot_receive")
    fields = [
      {
        name: "quantity",
        label: "Quantidade recebida neste lançamento",
        type: "number",
        required: true,
      },
      {
        name: "date",
        label: "Data de recebimento",
        type: "date",
        value: today(),
        required: true,
      },
    ];
  if (action === "lot_payment")
    fields = [
      {
        name: "amount",
        label: "Valor pago agora (R$)",
        type: "money",
        required: true,
      },
      {
        name: "date",
        label: "Data efetiva",
        type: "date",
        value: today(),
        required: true,
      },
    ];
  if (action === "cash_entry") {
    extra = {};
    fields = [
      {
        name: "type",
        label: "Lançamento",
        type: "select",
        options: [
          { value: "opening", label: "Saldo inicial confirmado" },
          { value: "contribution", label: "Aporte" },
          { value: "withdrawal", label: "Retirada" },
        ],
      },
      { name: "amount", label: "Valor (R$)", type: "money", required: true },
      {
        name: "date",
        label: "Data",
        type: "date",
        value: today(),
        required: true,
      },
      {
        name: "notes",
        label: "Conferência / motivo",
        type: "textarea",
        required: true,
      },
    ];
  }
  if (action === "payment_set")
    fields = [
      {
        name: "status",
        label: "Situação confirmada",
        type: "select",
        options: [
          { value: "pending", label: "Pendente confirmado (sem entrada)" },
          { value: "partial", label: "Recebimento parcial" },
          { value: "received", label: "Recebido integralmente" },
          { value: "unknown", label: "Não informado" },
        ],
      },
      {
        name: "amount",
        label: "Valor recebido neste lançamento (R$)",
        type: "money",
        nullable: true,
      },
      { name: "method", label: "Forma de pagamento", value: "Pix" },
      {
        name: "date",
        label: "Data do recebimento",
        type: "date",
        nullable: true,
        value: today(),
      },
    ];
  if (action === "order_update" && order)
    fields = [
      {
        name: "status",
        label: "Etapa do pedido",
        type: "select",
        value: order.status,
        options: orderStages.map((v) => ({ value: v, label: v })),
      },
      {
        name: "promised_date",
        label: "Prazo combinado",
        type: "date",
        nullable: true,
        value: order.promised_date,
      },
      {
        name: "responsible_id",
        label: "Responsável",
        type: "select",
        nullable: true,
        value: order.responsible_id,
        options: [
          { value: "", label: "Equipe AXL" },
          ...state.profiles.map((u) => ({ value: u.id, label: u.name })),
        ],
      },
      {
        name: "notes",
        label: "Arte, observações ou motivo de cancelamento",
        type: "textarea",
        value: order.notes,
      },
    ];
  if (action === "direct_order") {
    extra = {};
    fields = [
      {
        name: "company_id",
        label: "Empresa",
        type: "select",
        options: state.companies.map((c) => ({ value: c.id, label: c.name })),
      },
      {
        name: "product_id",
        label: "Solução física",
        type: "select",
        options: state.products
          .filter((p) => p.kind !== "service" && p.controls_stock)
          .map((p) => ({ value: p.id, label: p.name })),
      },
      {
        name: "quantity",
        label: "Quantidade",
        type: "number",
        value: 1,
        required: true,
      },
      { name: "promised_date", label: "Prazo", type: "date", nullable: true },
      { name: "notes", label: "Arte / observações", type: "textarea" },
    ];
  }
  return (
    <>
      {sale && (
        <p>
          {sale.company_name} · {money(sale.total)} · Recebido confirmado:{" "}
          {money(sale.paid)}
        </p>
      )}
      {modal.kind === "lot_review" && (
        <p className="notice">
          Esta conferência atualiza a referência de recebimento. Não adiciona
          materiais ao estoque nem inventa pagamentos passados. Conte o saldo
          físico separadamente; registre apenas novas entradas depois desta
          conferência.
        </p>
      )}
      {lot && (
        <p>
          {lot.code} · Recebido {lot.received}/{lot.quantity} ·{" "}
          {lot.receipt_status === "historical_review"
            ? "Referência histórica: revise o saldo atual antes de registrar novas entradas."
            : ""}
        </p>
      )}
      <ActionForm
        action={action}
        fields={fields}
        extra={extra}
        mutate={mutate}
        close={close}
      />
      {order && (
        <>
          <OrderItemsEditor order={order} state={state} mutate={mutate} />
          <h3>Reservas e produção</h3>
          <p>
            Reserva reduz o disponível, sem consumir o saldo físico. Produção
            confirmada baixa uma única vez.
          </p>
          <button
            className="secondary"
            onClick={() =>
              mutate("reserve", { id: order.id }).catch((e) =>
                window.alert(e.message),
              )
            }
          >
            Reservar materiais
          </button>
          <h3>Histórico do pedido</h3>
          {state.orderEvents
            ?.filter((e) => e.order_id === order.id)
            .map((e) => (
              <p key={e.id}>
                {e.type} · {e.user_name} · {e.notes}
              </p>
            ))}
        </>
      )}
    </>
  );
}
