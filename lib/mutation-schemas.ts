import { z } from "zod";
import {
  companySchema,
  productSchema,
  saleSchema,
  stages,
  orderStages,
} from "./domain";
const uuid = z.uuid();
const nonnegative = z.number().int().nonnegative();
const idInput = z.object({ id: uuid });
export const mutationSchemas = {
  company: companySchema,
  product: productSchema,
  sale: saleSchema,
  stage: z.object({
    id: uuid,
    status: z.enum(stages),
    reason: z.string().max(1000).default(""),
  }),
  activity: z.object({
    company_id: uuid,
    description: z.string().trim().min(1).max(5000),
    type: z.enum([
      "Observação",
      "Ligação",
      "Mensagem",
      "Visita",
      "Proposta",
      "Contato",
    ]),
  }),
  followup: z.object({
    company_id: uuid,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    reason: z.string().min(1).max(1000),
    responsible: z.string().max(100),
  }),
  followup_done: idInput,
  order: z.object({
    id: uuid,
    status: z.enum(orderStages),
    promised_date: z.union([z.iso.date(), z.literal("")]).default(""),
    notes: z.string().max(5000).default(""),
  }),
  produce: idInput,
  payment: z.object({
    sale_id: uuid,
    amount: z.number().int().positive(),
    method: z.enum([
      "Pix",
      "Dinheiro",
      "Cartão",
      "Boleto",
      "Transferência",
      "Outro",
    ]),
    date: z.iso.date(),
  }),
  expense: z.object({
    description: z.string().min(2).max(200),
    category: z.string().min(1).max(100),
    amount: z.number().int().positive(),
    date: z.iso.date(),
    paid: z.boolean(),
  }),
  stock: z.object({
    id: uuid,
    quantity: z
      .number()
      .finite()
      .refine((n) => n !== 0),
    type: z.enum(["Entrada", "Saída", "Ajuste", "Perda", "Devolução"]),
    description: z.string().min(2).max(1000),
  }),
  purchase: z.object({
    inventory_id: uuid,
    supplier: z.string().min(2).max(100),
    quantity: z.number().positive(),
    total: z.number().int().positive(),
    date: z.iso.date(),
    paid: z.boolean(),
  }),
  goal: z.object({ id: uuid, amount: z.number().int().positive() }),
  seller: z.object({
    name: z.string().min(2).max(100),
    email: z.union([z.email(), z.literal("")]),
    city: z.string().max(100),
    commission_type: z.enum(["percent", "plate", "margin"]),
    commission_value: nonnegative,
  }),
  route: z.object({
    name: z.string().min(2).max(100),
    date: z.iso.date(),
    salesperson_id: uuid.nullable(),
    companies: z.array(uuid).min(1).max(25),
  }),
  stop: z.object({
    id: uuid,
    status: z.enum([
      "Pendente",
      "Visitado",
      "Não encontrado",
      "Interessado",
      "Retornar depois",
      "Venda realizada",
    ]),
  }),
  user: z.object({
    name: z.string().min(2).max(100),
    email: z.email().max(200),
    password: z.string().min(12).max(256),
    role: z.enum(["ADMIN", "VENDEDOR", "PRODUCAO", "FINANCEIRO"]),
  }),
  password: z.object({
    current_password: z.string().min(1).max(256),
    new_password: z.string().min(12).max(256),
  }),
  components: z.object({
    product_id: uuid,
    components: z
      .array(
        z.object({
          inventory_id: uuid,
          quantity: z.number().positive().max(10000),
        }),
      )
      .max(100),
  }),
  inventory: z.object({
    name: z.string().min(2).max(100),
    unit: z.string().min(1).max(20),
    minimum: z.number().nonnegative(),
    cost: nonnegative,
    supplier: z.string().max(100).default(""),
  }),
  weights: z.object({
    rating: nonnegative.max(100),
    reviews: nonnegative.max(100),
    phone: nonnegative.max(100),
    website: nonnegative.max(100),
    segment: nonnegative.max(100),
    contact: nonnegative.max(100),
    other: nonnegative.max(100),
  }),
};
export function parseMutation(action: string, input: unknown) {
  const key = action as keyof typeof mutationSchemas;
  if (!Object.prototype.hasOwnProperty.call(mutationSchemas, key))
    throw new Error("Ação não reconhecida.");
  const parsed = mutationSchemas[key].parse(input);
  if (["company", "product", "inventory"].includes(action))
    return { ...parsed, ...z.object({ id: uuid.optional() }).parse(input) };
  return parsed;
}
