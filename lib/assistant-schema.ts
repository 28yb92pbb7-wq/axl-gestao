import { z } from "zod";
import { operationSchemas } from "./operations-schema";
import { mutationSchemas } from "./mutation-schemas";
export const assistantInputs = {
  buscar_empresa: z.object({
    name: z.string().max(160).default(""),
    id: z.uuid().optional(),
  }),
  consultar_resumo: z.object({}),
  preparar_importacao: z.object({
    text: z.string().min(1).max(10000),
    name: z.string().max(160).optional(),
    city: z.string().max(100).optional(),
    url: z.string().max(4096).optional(),
  }),
  confirmar_empresa: z.object({
    request_id: z.uuid(),
    url: z.string().max(4096),
    token: z.uuid().optional(),
    company_id: z.uuid().optional(),
    new_homonym: z.boolean().default(false),
    fields: mutationSchemas.company,
  }),
  registrar_venda: operationSchemas.quick_sale,
  registrar_recebimento: mutationSchemas.payment.extend({
    request_id: z.uuid(),
  }),
  registrar_despesa: mutationSchemas.expense.extend({ request_id: z.uuid() }),
  registrar_compra: operationSchemas.lot_purchase.extend({
    request_id: z.uuid(),
  }),
  atualizar_pedido: operationSchemas.order_update.extend({
    request_id: z.uuid(),
  }),
  registrar_contato: operationSchemas.contact.extend({ request_id: z.uuid() }),
  consultar_operacao: z.object({ request_id: z.uuid() }),
};
export type AssistantTool = keyof typeof assistantInputs;
export const assistantActions: Partial<Record<AssistantTool, string>> = {
  registrar_venda: "quick_sale",
  registrar_recebimento: "payment",
  registrar_despesa: "expense",
  registrar_compra: "lot_purchase",
  atualizar_pedido: "order_update",
  registrar_contato: "contact",
};
export const assistantTools = Object.entries(assistantInputs).map(
  ([name, schema]) => ({
    name,
    title: name.replaceAll("_", " "),
    description: (
      {
        buscar_empresa:
          "Lista candidatos; não escolhe homônimos automaticamente.",
        consultar_resumo:
          "Consulta vendas, pendências e estoque da AXL autorizada.",
        preparar_importacao:
          "Resolve link Google e prepara prévia sem cadastrar.",
        confirmar_empresa:
          "Confirma link/Place ID e cria ou associa dados próprios do CRM.",
        registrar_venda:
          "Registra venda com operação única; não presume pagamento recebido.",
        registrar_recebimento:
          "Registra recebimento informado, sem exceder saldo.",
        registrar_despesa:
          "Registra despesa com data e situação de pagamento explícitas.",
        registrar_compra:
          "Registra compra/lote; pagamento e recebimento de material são independentes.",
        atualizar_pedido: "Atualiza pedido pelas regras da gestão.",
        registrar_contato:
          "Registra tentativa, envio confirmado ou resposta separadamente.",
        consultar_operacao:
          "Verifica resultado de uma gravação incerta pelo identificador da operação.",
      } as Record<string, string>
    )[name],
    inputSchema: z.toJSONSchema(schema),
    annotations: {
      readOnlyHint: [
        "buscar_empresa",
        "consultar_resumo",
        "preparar_importacao",
        "consultar_operacao",
      ].includes(name),
      destructiveHint: false,
      idempotentHint: true,
    },
  }),
);
