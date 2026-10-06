import { randomUUID } from "node:crypto";
import { db, one, all, run, insert, transaction, audit } from "./db";
import {
  initializeLocalOperations,
  mutateLocalOperation,
} from "./operations-local";
import type { User } from "./auth";
import {
  listingSchema,
  shopCartSchema,
  shopSettingsSchema,
  emptyShopSettings,
  validListing,
  checkoutSchema,
  personalizationMissing,
  type ShopListing,
  type ShopSettings,
} from "./shop-schema";
import { z } from "zod";
import { validateMapsUrl } from "./maps-links";
export function initShop() {
  initializeLocalOperations();
  db().exec(
    `CREATE TABLE IF NOT EXISTS shop_carts(buyer_id TEXT PRIMARY KEY,items TEXT NOT NULL);CREATE TABLE IF NOT EXISTS shop_accounts(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,business TEXT DEFAULT '',password_hash TEXT NOT NULL,status TEXT DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS shop_sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES shop_accounts(id),expires_at TEXT NOT NULL);CREATE TABLE IF NOT EXISTS shop_listings(product_id TEXT PRIMARY KEY REFERENCES products(id),config TEXT NOT NULL);CREATE TABLE IF NOT EXISTS shop_config(id INTEGER PRIMARY KEY CHECK(id=1),config TEXT NOT NULL);CREATE TABLE IF NOT EXISTS shop_orders(id TEXT PRIMARY KEY,buyer_id TEXT REFERENCES shop_accounts(id),request_id TEXT UNIQUE NOT NULL,number INTEGER UNIQUE NOT NULL,data TEXT NOT NULL,payment_status TEXT DEFAULT 'pending',status TEXT DEFAULT 'Pedido recebido',expires_at TEXT NOT NULL,sale_id TEXT,production_order_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS shop_events(id TEXT PRIMARY KEY,order_id TEXT,user_id TEXT,type TEXT,details TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS shop_account_events(id TEXT PRIMARY KEY,buyer_id TEXT,admin_id TEXT,status TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS shop_assets(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,user_id TEXT,kind TEXT,version INTEGER,filename TEXT,mime TEXT,storage_path TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
  );
  if (
    !all<{ name: string }>("PRAGMA table_info(shop_accounts)").some(
      (c) => c.name === "company_id",
    )
  )
    db().exec(
      "ALTER TABLE shop_accounts ADD COLUMN company_id TEXT REFERENCES companies(id)",
    );
  db().exec(
    `CREATE TRIGGER IF NOT EXISTS shop_guard_update BEFORE UPDATE ON orders WHEN ((NEW.produced_at IS NOT NULL AND OLD.produced_at IS NULL) OR (NEW.status IN('Produção','Pronto para entrega','Saiu para entrega','Entregue') AND NEW.status<>OLD.status)) AND EXISTS(SELECT 1 FROM shop_orders WHERE production_order_id=NEW.id AND (payment_status<>'confirmed' OR COALESCE(json_extract(data,'$.art_approved'),0)<>1)) BEGIN SELECT RAISE(ABORT,'Loja requer pagamento conciliado e arte aprovada pelo comprador.');END;CREATE TRIGGER IF NOT EXISTS shop_items_changed AFTER UPDATE OF item_snapshot ON orders WHEN NEW.item_snapshot<>OLD.item_snapshot BEGIN UPDATE shop_orders SET data=json_set(data,'$.art_approved',0) WHERE production_order_id=NEW.id;END;`,
  );
}
export function localShopSettings() {
  initShop();
  const row = one<{ config: string }>(
    "SELECT config FROM shop_config WHERE id=1",
  );
  return row ? (JSON.parse(row.config) as ShopSettings) : emptyShopSettings;
}
export function localShopListings() {
  initShop();
  return all<{ config: string; name: string }>(
    "SELECT l.config,p.name FROM shop_listings l JOIN products p ON p.id=l.product_id WHERE p.active=1",
  ).map((r) => ({ ...JSON.parse(r.config), name: r.name }) as ShopListing);
}
export function localShopState(user?: User) {
  const settings = localShopSettings();
  const listings = localShopListings();
  const admin = user?.role === "ADMIN";
  const orders = user
    ? all<{ data: string; [k: string]: unknown }>(
        `SELECT o.* FROM shop_orders o ${admin ? "" : "WHERE buyer_id=?"} ORDER BY number DESC`,
        ...(admin ? [] : [user.id]),
      ).map((r) => {
        const d = JSON.parse(r.data);
        const operational = r.production_order_id
          ? one<{ status: string }>(
              "SELECT status FROM orders WHERE id=?",
              String(r.production_order_id),
            )
          : undefined;
        return {
          ...r,
          data: d,
          status: operational?.status || r.status,
          events: all(
            "SELECT id,type,created_at FROM shop_events WHERE order_id=?",
            String(r.id),
          ),
          assets: all(
            "SELECT id,kind,version,filename,created_at FROM shop_assets WHERE order_id=?",
            String(r.id),
          ),
        };
      })
    : [];
  return {
    settings,
    listings: admin
      ? listings
      : listings.filter((l) => l.published && validListing(l, settings)),
    cart: user
      ? JSON.parse(
          one<{ items: string }>(
            "SELECT items FROM shop_carts WHERE buyer_id=?",
            user.id,
          )?.items || "[]",
        )
      : [],
    account: user
      ? one(
          "SELECT id,name,email,phone,business,status FROM shop_accounts WHERE id=?",
          user.id,
        )
      : null,
    accounts: admin
      ? all(
          "SELECT id,name,email,phone,business,status,company_id,created_at FROM shop_accounts",
        )
      : [],
    accountEvents: admin ? all("SELECT * FROM shop_account_events") : [],
    orders,
  };
}
const buyer = (user: User) => {
  const a = one<{ status: string }>(
    "SELECT status FROM shop_accounts WHERE id=?",
    user.id,
  );
  if (user.role !== "COMPRADOR" || a?.status !== "approved")
    throw new Error("Seu cadastro precisa estar aprovado para comprar.");
};
function event(id: string, user: string, type: string, details: unknown) {
  insert("shop_events", {
    order_id: id,
    user_id: user,
    type,
    details: JSON.stringify(details),
  });
}
export function localShopMutation(action: string, input: unknown, user: User) {
  initShop();
  const admin = user.role === "ADMIN";
  const d = input as Record<string, unknown>;
  if (action === "cart") {
    if (user.role !== "COMPRADOR")
      throw new Error("Conta de comprador necessária.");
    const d = shopCartSchema.parse(input);
    run(
      "INSERT INTO shop_carts VALUES(?,?) ON CONFLICT(buyer_id) DO UPDATE SET items=excluded.items",
      user.id,
      JSON.stringify(d.items),
    );
    return { ok: true };
  }
  if (action === "account") {
    const v = z
      .object({
        name: z.string().trim().min(2).max(160),
        phone: z.string().min(8).max(40),
        business: z.string().max(160).default(""),
      })
      .parse(input);
    if (user.role !== "COMPRADOR") throw new Error("Conta externa necessária.");
    return transaction(() => {
      run(
        "UPDATE shop_accounts SET name=?,phone=?,business=? WHERE id=?",
        v.name,
        v.phone,
        v.business,
        user.id,
      );
      return { ok: true };
    });
  }
  if (action === "link_company") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const v = z
      .object({
        id: z.uuid(),
        company_id: z.uuid().nullable(),
        notes: z.string().trim().min(3).max(2000),
      })
      .parse(input);
    if (
      v.company_id &&
      !one("SELECT id FROM companies WHERE id=?", v.company_id)
    )
      throw new Error("Ficha não encontrada.");
    return transaction(() => {
      run(
        "UPDATE shop_accounts SET company_id=? WHERE id=?",
        v.company_id,
        v.id,
      );
      insert("shop_account_events", {
        buyer_id: v.id,
        admin_id: user.id,
        status: "Associação verificada",
        notes: v.notes,
      });
      audit(user.id, "Associação comprador/CRM verificada", v.id);
      return { ok: true };
    });
  }
  if (action === "settings") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const s = shopSettingsSchema.parse(input);
    return transaction(() => {
      const published = localShopListings().some(
        (l) => l.published && !validListing(l, s),
      );
      if (published)
        throw new Error(
          "Despublique os produtos antes de remover condições comerciais obrigatórias.",
        );
      run(
        "INSERT INTO shop_config VALUES(1,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config",
        JSON.stringify(s),
      );
      audit(user.id, "Condições da loja alteradas", user.id);
      return { ok: true };
    });
  }
  if (action === "listing") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const l = listingSchema.parse(input);
    const p = one<{ name: string; stock_inventory_id: string }>(
      "SELECT name,stock_inventory_id FROM products WHERE id=?",
      l.product_id,
    );
    if (!p) throw new Error("Produto inexistente.");
    if (l.availability === "finished" && !p.stock_inventory_id)
      throw new Error(
        "Vincule o produto ao estoque de produtos prontos antes de publicar.",
      );
    if (
      l.published &&
      !validListing({ ...l, name: p.name }, localShopSettings())
    )
      throw new Error(
        "Preço, disponibilidade, prazo e condições comerciais precisam estar completos para publicar.",
      );
    for (const c of l.components)
      if (!one("SELECT id FROM products WHERE id=?", c.product_id))
        throw new Error("Produto do combo inexistente.");
    return transaction(() => {
      run(
        "INSERT INTO shop_listings VALUES(?,?) ON CONFLICT(product_id) DO UPDATE SET config=excluded.config",
        l.product_id,
        JSON.stringify(l),
      );
      audit(user.id, "Produto da loja configurado", l.product_id);
      return { ok: true };
    });
  }
  if (action === "approval") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const v = z
      .object({
        id: z.uuid(),
        status: z.enum(["pending", "approved", "refused", "suspended"]),
        notes: z.string().max(2000).default(""),
      })
      .parse(input);
    return transaction(() => {
      if (!one("SELECT id FROM shop_accounts WHERE id=?", v.id))
        throw new Error("Comprador inexistente.");
      run("UPDATE shop_accounts SET status=? WHERE id=?", v.status, v.id);
      insert("shop_account_events", {
        buyer_id: v.id,
        admin_id: user.id,
        status: v.status,
        notes: v.notes,
      });
      audit(user.id, "Cadastro comprador " + v.status, v.id);
      return { ok: true };
    });
  }
  if (action === "checkout") {
    const v = checkoutSchema.parse(input);
    return transaction(() => {
      buyer(user);
      const previous = one(
        "SELECT id,number,data FROM shop_orders WHERE buyer_id=? AND request_id=?",
        user.id,
        v.request_id,
      );
      if (previous) {
        const p = previous as { id: string; number: number; data: string };
        const old = JSON.parse(p.data).checkout_input;
        if (old && JSON.stringify(old) !== JSON.stringify(v))
          throw new Error(
            "Esta operação já gerou um pedido com dados diferentes. Consulte Meus pedidos antes de tentar outra compra.",
          );
        return { id: p.id, number: p.number };
      }
      const s = localShopSettings();
      const delivery = s.delivery.find((x) => x.id === v.delivery_id);
      if (
        !delivery ||
        delivery.fee === null ||
        delivery.transport_days === null ||
        !delivery.area ||
        (delivery.needs_address && !v.address)
      )
        throw new Error(
          "Entrega/endereço/frete incompletos. Solicite orçamento antes de concluir.",
        );
      let total = delivery.fee;
      const items = v.items.map((i) => {
        const l = localShopListings().find(
          (l) => l.product_id === i.product_id,
        );
        if (!l?.published || !validListing(l, s))
          throw new Error("Produto indisponível ou incompleto.");
        if (l.options.length && !l.options.includes(i.option))
          throw new Error("Selecione um modelo válido.");
        const committed = all<{ data: string }>(
          "SELECT data FROM shop_orders WHERE status<>'Cancelado' AND (payment_status='confirmed' OR expires_at>?)",
          new Date().toISOString(),
        ).reduce(
          (sum, r) =>
            sum +
            (
              JSON.parse(r.data).items as {
                product_id: string;
                quantity: number;
              }[]
            )
              .filter((x) => x.product_id === i.product_id)
              .reduce((n, x) => n + x.quantity, 0),
          0,
        );
        const same = v.items
          .filter((x) => x.product_id === i.product_id)
          .reduce((n, x) => n + x.quantity, 0);
        if (committed + same > (l.quantity_available || 0))
          throw new Error(
            "Disponibilidade/capacidade insuficiente. Atualize o carrinho.",
          );
        if (l.availability === "finished") {
          const stock = one<{
            quantity: number;
            quantity_known: number;
            stock_inventory_id: string;
          }>(
            "SELECT i.quantity,i.quantity_known,p.stock_inventory_id FROM products p JOIN inventory_items i ON i.id=p.stock_inventory_id WHERE p.id=?",
            i.product_id,
          );
          const reserved = stock
            ? one<{ q: number }>(
                "SELECT COALESCE(SUM(quantity),0) q FROM inventory_reservations WHERE inventory_id=? AND status='reserved'",
                stock.stock_inventory_id,
              )?.q || 0
            : 0;
          if (
            !stock?.quantity_known ||
            stock.quantity - reserved - committed < same
          )
            throw new Error(
              "Estoque de produto pronto não confirmado ou insuficiente.",
            );
        }
        let price = l.price!;
        for (const tier of [...l.tiers].sort((a, b) => a.minimum - b.minimum))
          if (i.quantity >= tier.minimum) price = tier.price;
        if (i.personalization.google_url)
          validateMapsUrl(i.personalization.google_url);
        total += price * i.quantity;
        return {
          ...i,
          name: l.name,
          unit_price: price,
          total: price * i.quantity,
          kind: l.personalization,
          availability: l.availability,
          components: l.components,
          missing: personalizationMissing(l.personalization, i.personalization),
          production_days: l.production_days,
        };
      });
      if (v.expected_total !== null && v.expected_total !== total)
        throw new Error(
          "Preço atualizado. Confira o catálogo e tente novamente com os valores atuais.",
        );
      if (total > 100000000) throw new Error("Total acima do limite.");
      const id = randomUUID(),
        number =
          (one<{ n: number }>("SELECT MAX(number) n FROM shop_orders")?.n ||
            0) + 1;
      const expires = new Date(
        Date.now() + s.payment_hours! * 3600000,
      ).toISOString();
      insert("shop_orders", {
        id,
        buyer_id: user.id,
        request_id: v.request_id,
        number,
        data: JSON.stringify({
          items,
          total,
          delivery,
          address: v.address,
          checkout_input: v,
          origin: "Loja online",
          payment_terms: s.payment_terms,
          pix_payload: s.pix_payload,
          art_approved: false,
        }),
        expires_at: expires,
      });
      event(id, user.id, "Pedido colocado — aguardando pagamento", {});
      return { id, number };
    });
  }
  const id = z.uuid().parse(d.id);
  const order = one<{
    buyer_id: string;
    data: string;
    payment_status: string;
    production_order_id: string;
    sale_id: string;
    status: string;
    expires_at: string;
  }>("SELECT * FROM shop_orders WHERE id=?", id);
  if (!order || (!admin && order.buyer_id !== user.id))
    throw new Error("Pedido não encontrado.");
  const data = JSON.parse(order.data);
  if (action === "payment_confirm") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const date = z.iso.date().parse(d.date);
    if (d.confirmed !== true)
      throw new Error("Confirme a conciliação real do recebimento.");
    if (order.payment_status === "confirmed") return { id };
    if (
      order.status === "Cancelado" ||
      order.expires_at < new Date().toISOString()
    )
      throw new Error(
        "Pedido cancelado/expirado. Revise disponibilidade antes de uma nova compra.",
      );
    const account = one<{ name: string; business: string; company_id: string }>(
      "SELECT name,business FROM shop_accounts WHERE id=?",
      order.buyer_id,
    )!;
    // quick_sale já usa transação. O vínculo e a conversão ficam dentro da mesma transação de confirmação.
    return transaction(() => {
      const items = data.items.flatMap(
        (i: {
          product_id: string;
          quantity: number;
          total: number;
          availability: string;
          components: { product_id: string; quantity: number }[];
        }) =>
          i.components.length
            ? i.components.map((c) => ({
                product_id: c.product_id,
                quantity: c.quantity * i.quantity,
                line_total: null,
                from_stock: false,
              }))
            : [
                {
                  product_id: i.product_id,
                  quantity: i.quantity,
                  line_total: null,
                  from_stock: i.availability === "finished",
                },
              ],
      );
      // executar o serviço operacional dentro da transação externa por savepoint adapter
      const sale = mutateLocalOperation(
        "quick_sale",
        {
          request_id: id,
          defer_production: true,
          company_id: account.company_id || null,
          name: account.business || account.name,
          new_homonym: true,
          date,
          total: data.total,
          payment_status: "received",
          paid: data.total,
          method: "Pix",
          notes: `Loja online #${String(d.number || "")} · ${id}`,
          items,
        },
        user,
      ) as { id: string };
      if (!account.company_id)
        run(
          "UPDATE shop_accounts SET company_id=(SELECT company_id FROM sales WHERE id=?) WHERE id=?",
          sale.id,
          order.buyer_id,
        );
      const production = one<{ id: string }>(
        "SELECT id FROM orders WHERE sale_id=?",
        sale.id,
      );
      run(
        "UPDATE shop_orders SET payment_status='confirmed',sale_id=?,production_order_id=? WHERE id=?",
        sale.id,
        production?.id || null,
        id,
      );
      if (production)
        run(
          "UPDATE orders SET status='Arte pendente' WHERE id=? AND produced_at IS NULL",
          production.id,
        );
      event(id, user.id, "Pagamento conciliado", { date, total: data.total });
      audit(user.id, "Loja: pagamento confirmado", id);
      return { id };
    });
  }
  if (action === "personalization") {
    if (order.payment_status === "refunded" || order.status === "Cancelado")
      throw new Error("Pedido encerrado.");
    const idx = z.number().int().nonnegative().parse(d.index);
    const values = z.record(z.string(), z.string().max(4096)).parse(d.values);
    if (!data.items[idx]) throw new Error("Item inexistente.");
    if (
      order.production_order_id &&
      one<{ produced_at: string }>(
        "SELECT produced_at FROM orders WHERE id=?",
        order.production_order_id,
      )?.produced_at
    )
      throw new Error("Produção iniciada. Solicite alteração ao atendimento.");
    if (values.google_url) validateMapsUrl(values.google_url);
    data.items[idx].personalization = values;
    data.items[idx].missing = personalizationMissing(
      data.items[idx].kind,
      values,
    );
    data.art_approved = false;
    return transaction(() => {
      run("UPDATE shop_orders SET data=? WHERE id=?", JSON.stringify(data), id);
      if (order.production_order_id)
        run(
          "UPDATE orders SET status='Arte pendente' WHERE id=?",
          order.production_order_id,
        );
      event(id, user.id, "Personalização atualizada", { index: idx });
      return { id };
    });
  }
  if (action === "art_approve") {
    if (user.role !== "COMPRADOR")
      throw new Error("A aprovação deve ser feita pelo comprador.");
    const asset = one<{ id: string; version: number }>(
      "SELECT id,version FROM shop_assets WHERE order_id=? AND kind='art' ORDER BY version DESC LIMIT 1",
      id,
    );
    if (!asset || asset.id !== d.asset_id)
      throw new Error("Abra e aprove a versão atual da arte.");
    if (data.items.some((i: { missing: string[] }) => i.missing.length))
      throw new Error("Complete a personalização antes de aprovar.");
    return transaction(() => {
      data.art_approved = true;
      data.art_asset_id = asset.id;
      data.art_version = asset.version;
      data.art_approved_at = new Date().toISOString();
      run("UPDATE shop_orders SET data=? WHERE id=?", JSON.stringify(data), id);
      if (order.production_order_id)
        run(
          "UPDATE orders SET status='Arte aprovada' WHERE id=? AND produced_at IS NULL",
          order.production_order_id,
        );
      event(id, user.id, "Arte aprovada", { version: asset.version });
      return { id };
    });
  }
  if (action === "request_change" || action === "request_cancel") {
    const reason = z.string().trim().min(3).max(2000).parse(d.reason);
    return transaction(() => {
      event(
        id,
        user.id,
        action === "request_cancel"
          ? "Cancelamento solicitado"
          : "Alteração solicitada",
        { reason },
      );
      return { id };
    });
  }
  if (action === "cancel") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const reason = z.string().min(3).max(2000).parse(d.reason);
    if (order.payment_status === "confirmed")
      throw new Error(
        "Pedido pago: registre estorno conciliado antes de cancelar; produção real não será revertida.",
      );
    return transaction(() => {
      run("UPDATE shop_orders SET status='Cancelado' WHERE id=?", id);
      event(id, user.id, "Pedido cancelado", { reason });
      return { id };
    });
  }
  if (action === "refund") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    const date = z.iso.date().parse(d.date);
    const reason = z.string().trim().min(3).max(2000).parse(d.reason);
    if (d.confirmed !== true)
      throw new Error("Confirme que o estorno integral realmente ocorreu.");
    if (order.payment_status === "refunded") return { id };
    if (order.payment_status !== "confirmed")
      throw new Error("Somente pagamento conciliado pode ser estornado.");
    return transaction(() => {
      insert("expenses", {
        description: `Estorno integral loja #${id}`,
        category: "Estorno de venda",
        amount: data.total,
        date,
        paid: 1,
      });
      if (order.production_order_id)
        mutateLocalOperation(
          "order_update",
          { id: order.production_order_id, status: "Cancelado", notes: reason },
          user,
        );
      run(
        "UPDATE shop_orders SET payment_status='refunded',status='Cancelado' WHERE id=?",
        id,
      );
      event(id, user.id, "Estorno integral conciliado", {
        date,
        total: data.total,
        reason,
      });
      audit(user.id, "Estorno loja conciliado", id);
      return { id };
    });
  }
  if (action === "delivery") {
    if (!admin) throw new Error("Acesso restrito ao administrador.");
    data.tracking = z.string().max(500).parse(d.tracking);
    return transaction(() => {
      run("UPDATE shop_orders SET data=? WHERE id=?", JSON.stringify(data), id);
      event(id, user.id, "Rastreamento atualizado", {});
      return { id };
    });
  }
  throw new Error("Operação da loja não reconhecida.");
}
