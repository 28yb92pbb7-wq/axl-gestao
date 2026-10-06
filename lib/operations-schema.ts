import { z } from "zod";
const id = z.uuid();
const money = z.number().int().nonnegative().max(100000000);
const qty = z.number().int().positive().max(10000);
const date = z.iso.date();
export const operationSchemas = {
  quick_sale: z.object({
    request_id: id,
    defer_production: z.boolean().default(false),
    company_id: id.nullable().default(null),
    name: z.string().trim().min(2).max(160),
    new_homonym: z.boolean().default(false),
    contact: z.string().max(160).default(""),
    date,
    total: money.min(1),
    discount: money.default(0),
    payment_status: z
      .enum(["unknown", "pending", "partial", "received"])
      .default("unknown"),
    paid: money.nullable().default(null),
    method: z.string().max(30).default("Não informado"),
    due_date: date.nullable().default(null),
    phone: z.string().max(40).default(""),
    city: z.string().max(100).default(""),
    notes: z.string().max(5000).default(""),
    place_id: z.string().max(250).nullable().default(null),
    seller_lat: z.number().min(-90).max(90).nullable().default(null),
    seller_lng: z.number().min(-180).max(180).nullable().default(null),
    items: z
      .array(
        z.object({
          product_id: id,
          quantity: z.number().int().min(1).max(10000),
          line_total: money.nullable().default(null),
          service_cost: money.nullable().default(null),
          lot_id: id.nullable().default(null),
          from_stock: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(50),
  }),
  contact: z.object({
    company_id: id,
    type: z.enum([
      "WhatsApp aberto",
      "Mensagem enviada",
      "Resposta",
      "Ligação",
      "Visita",
      "Proposta",
      "Observação",
    ]),
    phone: z.string().max(40).default(""),
    text: z.string().max(5000).default(""),
    result: z
      .enum([
        "Não informado",
        "Sem resposta",
        "Respondeu",
        "Interessado",
        "Não interessado",
        "Retorno combinado",
      ])
      .default("Não informado"),
    next_at: z
      .union([
        z.iso.datetime({ local: true }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
      ])
      .nullable()
      .default(null),
  }),
  stage_confirm: z.object({
    company_id: id,
    status: z.enum([
      "Novo lead",
      "Contato realizado",
      "Interessado",
      "Proposta enviada",
      "Negociação",
      "Venda",
      "Perdido",
    ]),
    reason: z.string().max(2000).default(""),
  }),
  lot_purchase: z.object({
    inventory_id: id,
    code: z.string().trim().min(1).max(100),
    quantity: qty,
    amount: money,
    freight: money.default(0),
    date: date.nullable().default(null),
    supplier: z.string().max(160).default(""),
    paid: money.nullable().default(null),
    received: z.number().nonnegative().default(0),
    notes: z.string().max(2000).default(""),
  }),
  lot_review: z.object({
    id,
    current_received: z.number().nonnegative().max(1000000),
    date,
    notes: z.string().trim().min(3).max(2000),
  }),
  lot_receive: z.object({
    id,
    quantity: qty,
    date,
    notes: z.string().max(2000).default(""),
  }),
  stock_count: z.object({
    id,
    quantity: z.number().nonnegative().max(1000000),
    date,
    notes: z.string().trim().min(3).max(2000),
    initial: z.boolean().default(false),
  }),
  cash_entry: z.object({
    type: z.enum(["opening", "contribution", "withdrawal"]),
    amount: money,
    date,
    notes: z.string().max(2000).default(""),
  }),
  payment_set: z.object({
    id,
    status: z.enum(["unknown", "pending", "partial", "received"]),
    amount: money.nullable().default(null),
    method: z.string().max(30).default("Não informado"),
    date: date.nullable().default(null),
  }),
  order_update: z.object({
    id,
    status: z.enum([
      "Pedido recebido",
      "Arte pendente",
      "Aguardando aprovação",
      "Arte aprovada",
      "Produção",
      "Pronto para entrega",
      "Saiu para entrega",
      "Entregue",
      "Cancelado",
    ]),
    promised_date: date.nullable().default(null),
    notes: z.string().max(2000).default(""),
    responsible_id: id.nullable().default(null),
  }),
  order_items: z.object({
    id,
    items: z
      .array(
        z.object({
          product_id: id,
          quantity: z.number().int().min(1).max(10000),
          from_stock: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(50),
  }),
  product_stock: z.object({ id, inventory_id: id.nullable().default(null) }),
  reserve: z.object({ id }),
  produce: z.object({ id }),
  proposal: z.object({
    company_id: id,
    text: z.string().trim().min(3).max(5000),
    amount: money.nullable().default(null),
  }),
  direct_order: z.object({
    company_id: id,
    product_id: id,
    quantity: z.number().int().min(1).max(10000),
    notes: z.string().max(2000).default(""),
    promised_date: date.nullable().default(null),
  }),
  lot_payment: z.object({ id, amount: money.min(1), date }),
  material_cost: z.object({
    id,
    cost: money,
    status: z.enum(["confirmed", "estimated", "unknown"]),
    origin: z.string().trim().min(3).max(250),
  }),
};
export type OperationAction = keyof typeof operationSchemas;
export function operationalRole(role: string) {
  return ["ADMIN", "VENDEDOR"].includes(role);
}
