import { z } from "zod";
const text = z.string().trim().max(5000);
const money = z.number().int().nonnegative().max(100000000);
export const listingSchema = z.object({
  product_id: z.uuid(),
  published: z.boolean().default(false),
  description: text.default(""),
  photo: z.string().max(300).default(""),
  price: money.nullable().default(null),
  tiers: z
    .array(
      z.object({
        minimum: z.number().int().min(2).max(10000),
        price: money.min(1),
      }),
    )
    .max(20)
    .default([]),
  quantity_available: z
    .number()
    .int()
    .nonnegative()
    .max(10000)
    .nullable()
    .default(null),
  availability: z.enum(["made_to_order", "finished"]).default("made_to_order"),
  production_days: z
    .number()
    .int()
    .nonnegative()
    .max(365)
    .nullable()
    .default(null),
  personalization: z
    .enum(["google", "whatsapp", "instagram", "pix", "table", "combo"])
    .default("google"),
  options: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
  components: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.number().int().positive().max(100),
      }),
    )
    .max(20)
    .default([]),
});
export const shopSettingsSchema = z.object({
  business_name: text.default(""),
  business_details: text.default(""),
  support: text.default(""),
  purchase_policy: text.default(""),
  privacy: text.default(""),
  cancellation_policy: text.default(""),
  pix_payload: text.default(""),
  payment_terms: text.default(""),
  payment_hours: z.number().int().min(1).max(168).nullable().default(null),
  delivery: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z0-9_-]{1,50}$/),
        label: z.string().min(1).max(100),
        needs_address: z.boolean(),
        fee: money.nullable(),
        area: text,
        transport_days: z.number().int().nonnegative().max(365).nullable(),
      }),
    )
    .max(10)
    .default([]),
});
export type ShopListing = z.infer<typeof listingSchema> & { name: string };
export type ShopSettings = z.infer<typeof shopSettingsSchema>;
export const emptyShopSettings = shopSettingsSchema.parse({});
export const checkoutSchema = z.object({
  request_id: z.uuid(),
  expected_total: money.nullable().default(null),
  delivery_id: z.string().max(50),
  address: text.default(""),
  items: z
    .array(
      z.object({
        product_id: z.uuid(),
        quantity: z.number().int().min(1).max(10000),
        option: z.string().max(100).default(""),
        personalization: z.record(z.string(), z.string().max(4096)).default({}),
      }),
    )
    .min(1)
    .max(30),
});
export function publicListing(v: ShopListing) {
  return { ...v };
} // Configuração comercial contém só campos públicos; custo não entra no DTO.
export function validShopSettings(s: ShopSettings) {
  return !!(
    s.business_name &&
    s.business_details &&
    s.support &&
    s.purchase_policy &&
    s.privacy &&
    s.cancellation_policy &&
    s.pix_payload &&
    s.payment_terms &&
    s.payment_hours &&
    s.delivery.length
  );
}
export function validListing(l: ShopListing, s: ShopSettings) {
  return (
    validShopSettings(s) &&
    l.price !== null &&
    l.price > 0 &&
    !!l.description &&
    l.production_days !== null &&
    l.quantity_available !== null &&
    (l.availability !== "finished" || l.quantity_available >= 0) &&
    (l.personalization !== "combo" || l.components.length > 0)
  );
}
export function personalizationMissing(
  type: string,
  d: Record<string, string>,
) {
  const out: string[] = [];
  if (
    type === "whatsapp" &&
    !/^\+?\d{10,15}$/.test((d.phone || "").replace(/[\s()-]/g, ""))
  )
    out.push("Número WhatsApp válido");
  if (
    type === "instagram" &&
    !/^@?[A-Za-z0-9_.]{1,30}$/.test(d.instagram || "") &&
    !/^https:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(
      d.instagram || "",
    )
  )
    out.push("Perfil Instagram");
  if (type === "google" && (!d.google_url || d.google_confirmed !== "true"))
    out.push("Link Google da empresa confirmado");
  if (type === "pix" && !d.pix_payload)
    out.push("QR/payload Pix fornecido pelo cliente");
  if ((type === "combo" || type === "table") && !d.notes?.trim())
    out.push("Detalhes de personalização dos modelos/itens");
  return out;
}

export const shopCartSchema = z.object({
  items: z.array(checkoutSchema.shape.items.element).max(30),
});
