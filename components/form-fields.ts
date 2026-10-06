import type { Company, Product, State } from "@/lib/types";
import { stages } from "@/lib/domain";
import type { Field } from "./ui";
export function companyFields(c: Company | undefined, state: State): Field[] {
  return [
    { name: "name", label: "Nome fantasia", value: c?.name, required: true },
    { name: "legal_name", label: "Razão social", value: c?.legal_name },
    { name: "document", label: "CNPJ / CPF", value: c?.document },
    { name: "contact", label: "Responsável", value: c?.contact },
    { name: "phone", label: "Telefone / WhatsApp", value: c?.phone },
    { name: "email", label: "E-mail", type: "email", value: c?.email },
    {
      name: "city",
      label: "Cidade",
      value: c?.city || "Valinhos",
      required: true,
    },
    { name: "neighborhood", label: "Bairro", value: c?.neighborhood },
    { name: "state", label: "Estado (UF)", value: c?.state || "SP" },
    { name: "postal_code", label: "CEP", value: c?.postal_code },
    { name: "address", label: "Endereço", value: c?.address },
    { name: "segment", label: "Segmento", value: c?.segment || "Outros" },
    {
      name: "origin",
      label: "Origem",
      type: "select",
      value: c?.origin || "Outro",
      options: [
        "Google",
        "Indicação",
        "Porta a porta",
        "Instagram",
        "WhatsApp",
        "Cliente antigo",
        "Vendedor",
        "Outro",
        "Demonstração",
      ].map((v) => ({ value: v, label: v })),
    },
    {
      name: "status",
      label: "Etapa comercial",
      type: "select",
      value: c?.status || "Novo lead",
      options: stages.map((v) => ({ value: v, label: v })),
    },
    {
      name: "salesperson_id",
      label: "Vendedor responsável",
      type: "select",
      nullable: true,
      value: c?.salesperson_id,
      options: [
        { value: "", label: "Sem responsável" },
        ...state.salespeople.map((s) => ({ value: s.id, label: s.name })),
      ],
    },
    {
      name: "notes",
      label: "Observações",
      type: "textarea",
      value: c?.notes,
    },
  ];
}
export function productFields(p?: Product): Field[] {
  return [
    {
      name: "name",
      label: "Nome do produto",
      value: p?.name,
      required: true,
    },
    { name: "sku", label: "SKU", value: p?.sku, required: true },
    {
      name: "category",
      label: "Categoria",
      type: "select",
      value: p?.category || "Placas NFC",
      options: [
        "Placas NFC",
        "Placas QR",
        "Adesivos NFC",
        "Cartões NFC",
        "Serviços digitais",
        "Consultoria",
        "Outros",
      ].map((v) => ({ value: v, label: v })),
    },
    { name: "unit", label: "Unidade", value: p?.unit || "un" },
    {
      name: "price",
      label: "Preço sugerido (R$)",
      type: "money",
      value: p?.price,
      required: true,
    },
    {
      name: "cost",
      label: "Custo padrão (R$)",
      type: "money",
      value: p?.cost,
      required: true,
      hint: "Composição cadastrada tem prioridade sobre o custo padrão.",
    },
    {
      name: "is_plate",
      label: "Contar como placa",
      type: "checkbox",
      value: p ? !!p.is_plate : true,
    },
    {
      name: "active",
      label: "Ativo no catálogo",
      type: "checkbox",
      value: p ? !!p.active : true,
    },
    {
      name: "uses_nfc",
      label: "Utiliza NFC",
      type: "checkbox",
      value: !!p?.uses_nfc,
    },
    {
      name: "uses_acrylic",
      label: "Utiliza acrílico",
      type: "checkbox",
      value: !!p?.uses_acrylic,
    },
    {
      name: "controls_stock",
      label: "Controla estoque",
      type: "checkbox",
      value: !!p?.controls_stock,
    },
    {
      name: "description",
      label: "Descrição",
      type: "textarea",
      value: p?.description,
    },
  ];
}
