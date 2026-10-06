import { z } from "zod";
export const stages = [
  "Novo lead",
  "Contato realizado",
  "Interessado",
  "Proposta enviada",
  "Negociação",
  "Venda",
  "Perdido",
] as const;
export const orderStages = [
  "Pedido recebido",
  "Arte pendente",
  "Aguardando aprovação",
  "Arte aprovada",
  "Produção",
  "Pronto para entrega",
  "Saiu para entrega",
  "Entregue",
  "Cancelado",
] as const;
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const dateBR = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split("-").reverse().join("/")
    : new Date(value).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
export const companySchema = z.object({
  name: z.string().trim().min(2).max(160),
  legal_name: z.string().max(160).default(""),
  document: z.string().max(30).default(""),
  contact: z.string().max(160).default(""),
  phone: z.string().max(30).default(""),
  email: z.union([z.email(), z.literal("")]).default(""),
  city: z.string().trim().min(2).max(100),
  neighborhood: z.string().max(100).default(""),
  state: z.string().max(2).default("SP"),
  address: z.string().max(250).default(""),
  postal_code: z.string().max(12).default(""),
  segment: z.string().max(100).default("Outros"),
  origin: z.string().max(100).default("Outro"),
  notes: z.string().max(5000).default(""),
  is_customer: z.boolean().default(false),
  is_lead: z.boolean().default(true),
  status: z.enum(stages).default("Novo lead"),
  salesperson_id: z.uuid().nullable().default(null),
  place_id: z.string().max(250).nullable().default(null),
});
export const productSchema = z.object({
  name: z.string().trim().min(2).max(160),
  sku: z.string().trim().min(1).max(40),
  category: z.string().min(1).max(100),
  description: z.string().max(1000).default(""),
  price: z.number().int().nonnegative().max(100000000),
  cost: z.number().int().nonnegative().max(100000000),
  is_plate: z.boolean().default(true),
  active: z.boolean().default(true),
  uses_nfc: z.boolean().default(false),
  uses_acrylic: z.boolean().default(false),
  controls_stock: z.boolean().default(false),
  unit: z.string().max(20).default("un"),
});
export const saleSchema = z.object({
  company_id: z.uuid(),
  date: z.iso.date(),
  salesperson_id: z.uuid().nullable().default(null),
  method: z.enum([
    "Pix",
    "Dinheiro",
    "Cartão",
    "Boleto",
    "Transferência",
    "Outro",
  ]),
  paid: z.number().int().nonnegative(),
  due_date: z.iso.date(),
  notes: z.string().max(5000).default(""),
  items: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.number().int().min(1).max(10000),
        price: z.number().int().nonnegative().max(100000000),
      }),
    )
    .min(1)
    .max(100),
});
export type SaleLine = {
  quantity: number;
  price: number;
  cost: number;
  is_plate: boolean;
};
export function calculateSale(items: SaleLine[]) {
  const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
  const cost = items.reduce((s, i) => s + i.quantity * i.cost, 0);
  const plates = items.reduce((s, i) => s + (i.is_plate ? i.quantity : 0), 0);
  return {
    total,
    cost,
    profit: total - cost,
    margin: total ? (100 * (total - cost)) / total : 0,
    plates,
    averagePlate: plates ? total / plates : 0,
  };
}
export type ScoreWeights = {
  rating: number;
  reviews: number;
  phone: number;
  website: number;
  segment: number;
  contact: number;
  other: number;
};
export const defaultWeights: ScoreWeights = {
  rating: 25,
  reviews: 25,
  phone: 10,
  website: 10,
  segment: 15,
  contact: 10,
  other: 5,
};
export function opportunityScore(
  input: {
    rating?: number;
    reviews?: number;
    phone?: string;
    website?: string;
    segment?: string;
    contacted?: boolean;
  },
  weights = defaultWeights,
) {
  const reasons = [
    {
      label: "Nota Google",
      points:
        input.rating === undefined
          ? 0
          : Math.round(Math.min(input.rating / 5, 1) * weights.rating),
    },
    {
      label: "Poucas avaliações",
      points:
        input.reviews === undefined
          ? 0
          : Math.round(weights.reviews * Math.max(0, 1 - input.reviews / 200)),
    },
    { label: "Telefone disponível", points: input.phone ? weights.phone : 0 },
    {
      label: "Sem site",
      points:
        input.website === undefined ? 0 : !input.website ? weights.website : 0,
    },
    {
      label: "Aderência do segmento",
      points: /restaurante|pet|barbearia|salão|clínica/i.test(
        input.segment || "",
      )
        ? weights.segment
        : Math.round(weights.segment / 2),
    },
    { label: "Nunca contatado", points: input.contacted ? 0 : weights.contact },
  ];
  return {
    score: Math.max(
      0,
      Math.min(
        100,
        reasons.reduce((s, r) => s + r.points, 0),
      ),
    ),
    reasons,
  };
}
export function commission(
  total: number,
  profit: number,
  plates: number,
  rule: { type: "percent" | "plate" | "margin"; value: number },
) {
  return Math.round(
    rule.type === "percent"
      ? (total * rule.value) / 100
      : rule.type === "margin"
        ? (profit * rule.value) / 100
        : plates * rule.value,
  );
}
export function ltv(sales: { total: number; cancelled?: boolean }[]) {
  return sales.filter((s) => !s.cancelled).reduce((sum, s) => sum + s.total, 0);
}
export function stockRequirements(
  lines: {
    quantity: number;
    components: { inventory_id: string; quantity: number }[];
  }[],
) {
  const needed: Record<string, number> = {};
  for (const line of lines)
    for (const c of line.components)
      needed[c.inventory_id] =
        (needed[c.inventory_id] || 0) + line.quantity * c.quantity;
  return needed;
}
