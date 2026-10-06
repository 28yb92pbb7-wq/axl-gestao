import { z } from "zod";
import { supabaseEnabled } from "./backend";
import { supabaseServer } from "./integrations/supabase-server";
import type { User } from "./auth";
import {
  listingSchema,
  shopCartSchema,
  shopSettingsSchema,
  checkoutSchema,
  emptyShopSettings,
  type ShopListing,
  type ShopSettings,
} from "./shop-schema";
export type ShopAccount = {
  id: string;
  name: string;
  email: string;
  phone: string;
  business: string;
  company_id?: string;
  status: string;
};
export type ShopOrder = {
  id: string;
  number: number;
  buyer_id: string;
  status: string;
  payment_status: string;
  expires_at: string;
  production_order_id?: string;
  sale_id?: string;
  data: {
    total: number;
    items: {
      product_id: string;
      name: string;
      quantity: number;
      unit_price: number;
      total: number;
      option: string;
      kind: string;
      personalization: Record<string, string>;
      missing?: string[];
    }[];
    delivery: {
      label: string;
      fee: number;
      area: string;
      transport_days: number;
    };
    address: string;
    pix_payload: string;
    payment_terms: string;
    art_approved: boolean;
    tracking?: string;
  };
  events: { id: string; type: string; created_at: string }[];
  assets: { id: string; kind: string; version: number; filename: string }[];
};
export type ShopState = {
  cart: z.infer<typeof shopCartSchema>["items"];
  settings: ShopSettings;
  listings: ShopListing[];
  account: ShopAccount | null;
  accounts: ShopAccount[];
  orders: ShopOrder[];
  accountEvents: {
    id: string;
    buyer_id: string;
    admin_id: string;
    status: string;
    notes: string;
    created_at: string;
  }[];
};
export async function shopState(user?: User) {
  if (!supabaseEnabled()) {
    const { localShopState } = await import("./shop-local");
    return localShopState(user) as unknown as ShopState;
  }
  const c = await supabaseServer();
  const { data, error } = await c.rpc(user ? "shop_state" : "shop_catalog");
  if (error)
    throw new Error(
      "Aplique database/update-links-shop.sql para ativar a loja.",
    );
  return {
    ...data,
    settings: shopSettingsSchema.parse({
      ...emptyShopSettings,
      ...data.settings,
    }),
    cart: data.cart || [],
    account: data.account || null,
    accounts: data.accounts || [],
    accountEvents: data.accountEvents || [],
    orders: data.orders || [],
  } as ShopState;
}
export function parseShopMutation(action: string, input: unknown) {
  if (action === "cart") return shopCartSchema.parse(input);
  if (action === "settings") return shopSettingsSchema.parse(input);
  if (action === "listing") return listingSchema.parse(input);
  if (action === "checkout") return checkoutSchema.parse(input);
  const id = z.uuid();
  const schemas = {
    account: z.object({
      name: z.string().trim().min(2).max(160),
      phone: z.string().min(8).max(40),
      business: z.string().max(160).default(""),
    }),
    refund: z.object({
      id,
      date: z.iso.date(),
      reason: z.string().trim().min(3).max(2000),
      confirmed: z.literal(true),
    }),
    link_company: z.object({
      id,
      company_id: id.nullable(),
      notes: z.string().trim().min(3).max(2000),
    }),
    approval: z.object({
      id,
      status: z.enum(["pending", "approved", "refused", "suspended"]),
      notes: z.string().max(2000).default(""),
    }),
    payment_confirm: z.object({
      id,
      date: z.iso.date(),
      confirmed: z.literal(true),
    }),
    personalization: z.object({
      id,
      index: z.number().int().nonnegative().max(29),
      values: z.record(z.string(), z.string().max(4096)),
    }),
    art_approve: z.object({ id, asset_id: id }),
    request_change: z.object({
      id,
      reason: z.string().trim().min(3).max(2000),
    }),
    request_cancel: z.object({
      id,
      reason: z.string().trim().min(3).max(2000),
    }),
    cancel: z.object({ id, reason: z.string().trim().min(3).max(2000) }),
    delivery: z.object({ id, tracking: z.string().max(500) }),
  };
  if (!Object.hasOwn(schemas, action))
    throw new Error("Ação da loja não reconhecida.");
  return schemas[action as keyof typeof schemas].parse(input);
}
export async function shopMutation(action: string, input: unknown, user: User) {
  const data = parseShopMutation(action, input);
  if (!supabaseEnabled()) {
    const { localShopMutation } = await import("./shop-local");
    return localShopMutation(action, data, user);
  }
  const c = await supabaseServer();
  const { data: result, error } = await c.rpc("shop_mutate", {
    a: action,
    d: data,
  });
  if (error)
    throw new Error(
      error.code === "P0001"
        ? error.message
        : "Não foi possível concluir a operação da loja.",
    );
  return result;
}
