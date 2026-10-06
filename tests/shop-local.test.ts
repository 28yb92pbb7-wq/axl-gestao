import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { db, insert, one, all } from "../lib/db";
import { hashPassword, type User } from "../lib/auth";
import { initShop, localShopMutation, localShopState } from "../lib/shop-local";
import { shopSettingsSchema, listingSchema } from "../lib/shop-schema";
import { mutateLocalOperation } from "../lib/operations-local";
import { fileFormat } from "../lib/shop-assets";
test("loja local: aprovação, total servidor, idempotência, isolamento, arte, pagamento e estorno preservam estoque", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "axl-shop-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  process.env.AXL_BACKEND = "local";
  try {
    const admin: User = {
      id: insert("profiles", {
        name: "Alex",
        email: "shop-admin@example.com",
        role: "ADMIN",
        password_hash: hashPassword("TesteSomenteLocal!2026"),
      }),
      name: "Alex",
      email: "shop-admin@example.com",
      role: "ADMIN",
    };
    initShop();
    const buyer: User = {
      id: insert("shop_accounts", {
        name: "Comprador",
        email: "buyer@example.com",
        phone: "11999999999",
        password_hash: hashPassword("TesteSomenteLocal!2026"),
      }),
      name: "Comprador",
      email: "buyer@example.com",
      role: "COMPRADOR",
    };
    const other: User = {
      ...buyer,
      id: insert("shop_accounts", {
        name: "Outro",
        email: "other@example.com",
        phone: "11999999999",
        password_hash: "test",
      }),
    };
    const p = one<{ id: string }>(
      "SELECT id FROM products WHERE sku=?",
      "AXL-PIX-QR",
    )!;
    const settings = shopSettingsSchema.parse({
      business_name: "AXL teste",
      business_details: "Dados de teste",
      support: "Atendimento de teste",
      purchase_policy: "Política de teste",
      privacy: "Privacidade de teste",
      cancellation_policy: "Cancelamento de teste",
      pix_payload: "Chave só de teste",
      payment_terms: "Pagamento de teste",
      payment_hours: 24,
      delivery: [
        {
          id: "retirada",
          label: "Retirada",
          needs_address: false,
          fee: 0,
          area: "Local de teste",
          transport_days: 0,
        },
      ],
    });
    localShopMutation("settings", settings, admin);
    const listing = listingSchema.parse({
      product_id: p.id,
      description: "Placa Pix teste",
      price: 5000,
      quantity_available: 3,
      production_days: 2,
      personalization: "pix",
      published: true,
    });
    localShopMutation("listing", listing, admin);
    const payload = {
      request_id: randomUUID(),
      delivery_id: "retirada",
      items: [{ product_id: p.id, quantity: 2, price: 1 }],
    };
    assert.throws(
      () => localShopMutation("checkout", payload, buyer),
      /aprovado/,
    );
    assert.throws(
      () =>
        localShopMutation(
          "approval",
          { id: buyer.id, status: "approved" },
          buyer,
        ),
      /administrador/,
    );
    localShopMutation("approval", { id: buyer.id, status: "approved" }, admin);
    const result = localShopMutation("checkout", payload, buyer) as {
      id: string;
    };
    assert.equal(
      (localShopMutation("checkout", payload, buyer) as { id: string }).id,
      result.id,
    );
    assert.equal(
      one<{ data: string }>(
        "SELECT data FROM shop_orders WHERE id=?",
        result.id,
      ) &&
        JSON.parse(
          one<{ data: string }>(
            "SELECT data FROM shop_orders WHERE id=?",
            result.id,
          )!.data,
        ).total,
      10000,
    );
    assert.equal(all("SELECT * FROM sales").length, 0);
    assert.equal(all("SELECT * FROM payments").length, 0);
    assert.equal(localShopState(other).orders.length, 0);
    assert.throws(
      () =>
        localShopMutation(
          "personalization",
          { id: result.id, index: 0, values: {} },
          other,
        ),
      /não encontrado/,
    );
    assert.throws(
      () =>
        localShopMutation(
          "checkout",
          { ...payload, request_id: randomUUID() },
          buyer,
        ),
      /insuficiente/,
    );
    localShopMutation("approval", { id: buyer.id, status: "suspended" }, admin);
    assert.throws(
      () =>
        localShopMutation(
          "checkout",
          { ...payload, request_id: randomUUID() },
          buyer,
        ),
      /aprovado/,
    );
    localShopMutation("approval", { id: buyer.id, status: "approved" }, admin);
    localShopMutation(
      "personalization",
      { id: result.id, index: 0, values: { pix_payload: "Payload teste" } },
      buyer,
    );
    localShopMutation(
      "payment_confirm",
      { id: result.id, date: "2026-10-06", confirmed: true },
      admin,
    );
    localShopMutation(
      "payment_confirm",
      { id: result.id, date: "2026-10-06", confirmed: true },
      admin,
    );
    assert.equal(all("SELECT * FROM sales").length, 1);
    assert.equal(all("SELECT * FROM payments").length, 1);
    assert.equal(all("SELECT * FROM orders").length, 1);
    for (const material of all<{ id: string }>(
      "SELECT id FROM inventory_items",
    ))
      mutateLocalOperation(
        "stock_count",
        {
          id: material.id,
          quantity: 100,
          date: "2026-10-06",
          notes: "Contagem de teste",
          initial: true,
        },
        admin,
      );
    const order = one<{ production_order_id: string }>(
      "SELECT * FROM shop_orders WHERE id=?",
      result.id,
    )!;
    assert.throws(
      () =>
        mutateLocalOperation(
          "order_update",
          { id: order.production_order_id, status: "Arte aprovada" },
          admin,
        ) &&
        mutateLocalOperation(
          "produce",
          { id: order.production_order_id },
          admin,
        ),
      /pagamento|arte/i,
    );
    const art = insert("shop_assets", {
      order_id: result.id,
      user_id: admin.id,
      kind: "art",
      version: 1,
      filename: "teste.png",
      mime: "image/png",
      storage_path: "test",
    });
    localShopMutation("art_approve", { id: result.id, asset_id: art }, buyer);
    assert.equal(
      JSON.parse(
        one<{ data: string }>(
          "SELECT data FROM shop_orders WHERE id=?",
          result.id,
        )!.data,
      ).art_approved,
      true,
    );
    const inventoryBefore = all("SELECT id,quantity FROM inventory_items");
    localShopMutation(
      "refund",
      {
        id: result.id,
        date: "2026-10-06",
        reason: "Estorno teste",
        confirmed: true,
      },
      admin,
    );
    localShopMutation(
      "refund",
      {
        id: result.id,
        date: "2026-10-06",
        reason: "Estorno teste",
        confirmed: true,
      },
      admin,
    );
    assert.equal(all("SELECT * FROM expenses").length, 1);
    assert.deepEqual(
      all("SELECT id,quantity FROM inventory_items"),
      inventoryBefore,
    );
    assert.equal(
      fileFormat(Buffer.from("%PDF-1.7\n"), "application/pdf"),
      "pdf",
    );
    assert.throws(
      () => fileFormat(Buffer.from("<script>alert(1)</script>"), "image/png"),
      /Formato real/,
    );
  } finally {
    db().close();
    delete (globalThis as { axlDb?: unknown }).axlDb;
    rmSync(dir, { recursive: true, force: true });
  }
});
