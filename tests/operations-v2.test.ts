import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "a0000000-0000-4000-8000-000000000001",
  member = "a0000000-0000-4000-8000-000000000002";
test("v2: venda rápida, contatos, lote, reserva, consumo, caixa e colaboração preservam histórico", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`,
    );
    for (const f of [
      "supabase.sql",
      "supabase-runtime.sql",
      "supabase-state.sql",
      "supabase-import.sql",
      "update-2026-10-06.sql",
    ])
      await pg.exec(
        readFileSync("database/" + f, "utf8").replace(
          "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
          "",
        ),
      );
    await pg.exec(
      `INSERT INTO auth.users VALUES('${admin}'),('${member}');INSERT INTO profiles(id,name,email,role) VALUES('${admin}','Alex','alex@example.com','ADMIN'),('${member}','Laura','laura@example.com','VENDEDOR');GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated;SET request.jwt.claim.sub='${admin}';`,
    );
    const op = async (action: string, d: unknown) =>
      (
        await pg.query<{
          r: { id: string; company_id: string; order_id: string };
        }>("SELECT axl_ops($1,$2::jsonb) r", [action, JSON.stringify(d)])
      ).rows[0].r;
    const products = (
      await pg.query<{ id: string; sku: string }>("SELECT id,sku FROM products")
    ).rows;
    const google = products.find((p) => p.sku === "AXL-GOOGLE")!.id,
      pix = products.find((p) => p.sku === "AXL-PIX-QR")!.id;
    const request = "f0000000-0000-4000-8000-000000000001";
    const payload = {
      request_id: request,
      name: "Estabelecimento novo",
      date: "2026-10-06",
      total: 16500,
      payment_status: "unknown",
      items: [
        { product_id: google, quantity: 3 },
        { product_id: pix, quantity: 2 },
      ],
    };
    const sale = await op("quick_sale", payload);
    assert.equal((await op("quick_sale", payload)).id, sale.id);
    const row = (
      await pg.query<{
        total: number;
        plates: number;
        cost: number;
        cost_status: string;
        payment_known: boolean;
      }>(
        "SELECT total,plates,cost,cost_status,payment_known FROM sales WHERE id=$1",
        [sale.id],
      )
    ).rows[0];
    assert.deepEqual(row, {
      total: 16500,
      plates: 5,
      cost: 2352,
      cost_status: "estimated",
      payment_known: false,
    });
    assert.equal((await pg.query("SELECT * FROM payments")).rows.length, 0);
    assert.equal((await pg.query("SELECT * FROM sales")).rows.length, 1);
    await assert.rejects(
      op("quick_sale", {
        ...payload,
        request_id: "f0000000-0000-4000-8000-000000000002",
      }),
      /homônimo/,
    );
    await op("contact", {
      company_id: sale.company_id,
      type: "WhatsApp aberto",
      phone: "5511999999999",
      text: "Olá",
      result: "Não informado",
    });
    await pg.query("UPDATE companies SET status='Novo lead' WHERE id=$1", [
      sale.company_id,
    ]);
    await assert.rejects(
      op("stage_confirm", {
        company_id: sale.company_id,
        status: "Contato realizado",
      }),
      /efetivo/,
    );
    await op("contact", {
      company_id: sale.company_id,
      type: "Mensagem enviada",
      phone: "5511999999999",
      text: "Mensagem confirmada",
      result: "Sem resposta",
    });
    assert.equal(
      (
        await pg.query<{ status: string }>(
          "SELECT status FROM companies WHERE id=$1",
          [sale.company_id],
        )
      ).rows[0].status,
      "Contato realizado",
    );
    await assert.rejects(op("reserve", { id: sale.order_id }), /conferir/);
    const materials = (
      await pg.query<{ id: string }>("SELECT id FROM inventory_items")
    ).rows;
    for (const m of materials)
      await op("stock_count", {
        id: m.id,
        quantity: 20,
        date: "2026-10-06",
        notes: "Contagem física confirmada",
        initial: true,
      });
    await op("reserve", { id: sale.order_id });
    const before = (
      await pg.query("SELECT quantity FROM inventory_items ORDER BY name")
    ).rows;
    await assert.rejects(op("produce", { id: sale.order_id }), /aprovação/);
    await op("order_update", {
      id: sale.order_id,
      status: "Arte aprovada",
      notes: "Alex confirmou aprovação",
    });
    await op("produce", { id: sale.order_id });
    await assert.rejects(op("produce", { id: sale.order_id }), /uma vez/);
    const after = (
      await pg.query<{ quantity: number }>(
        "SELECT quantity FROM inventory_items ORDER BY name",
      )
    ).rows;
    assert.notDeepEqual(after, before);
    await op("order_update", {
      id: sale.order_id,
      status: "Cancelado",
      notes: "Cancelamento após produção real",
    });
    assert.deepEqual(
      (await pg.query("SELECT quantity FROM inventory_items ORDER BY name"))
        .rows,
      after,
    );
    await op("payment_set", {
      id: sale.id,
      status: "partial",
      amount: 5000,
      date: "2026-10-06",
      method: "Pix",
    });
    await op("cash_entry", {
      type: "opening",
      amount: 10000,
      date: "2026-10-06",
      notes: "Saldo inicial contado",
    });
    const mat = materials[0].id;
    const buy = await op("lot_purchase", {
      inventory_id: mat,
      code: "NOVO-01",
      quantity: 10,
      amount: 1000,
      freight: 100,
      received: 0,
      date: "2026-10-06",
      paid: 500,
    });
    await op("lot_receive", { id: buy.id, quantity: 3, date: "2026-10-06" });
    await assert.rejects(
      op("lot_receive", { id: buy.id, quantity: 8, date: "2026-10-06" }),
      /excede/,
    );
    const finished = (
      await pg.query<{ id: string }>(
        "INSERT INTO inventory_items(name,quantity,cost,quantity_known,kind) VALUES('Placa pronta contada',5,502,true,'finished') RETURNING id",
      )
    ).rows[0].id;
    await op("product_stock", { id: google, inventory_id: finished });
    const materialsBefore = (
      await pg.query(
        "SELECT id,quantity FROM inventory_items WHERE id<>$1 ORDER BY id",
        [finished],
      )
    ).rows;
    const ready = await op("quick_sale", {
      request_id: "f0000000-0000-4000-8000-000000000009",
      name: "Venda pronta",
      date: "2026-10-06",
      total: 12000,
      payment_status: "received",
      items: [{ product_id: google, quantity: 2, from_stock: true }],
    });
    assert.equal(
      (
        await pg.query<{ quantity: number }>(
          "SELECT quantity::float8 AS quantity FROM inventory_items WHERE id=$1",
          [finished],
        )
      ).rows[0].quantity,
      3,
    );
    assert.deepEqual(
      (
        await pg.query(
          "SELECT id,quantity FROM inventory_items WHERE id<>$1 ORDER BY id",
          [finished],
        )
      ).rows,
      materialsBefore,
    );
    await assert.rejects(op("produce", { id: ready.order_id }), /uma vez/);
    const digital = products.find((p) => p.sku === "AXL-DIGITAL")!.id;
    const digitalSale = await op("quick_sale", {
      request_id: "f0000000-0000-4000-8000-000000000008",
      name: "Venda digital",
      date: "2026-10-06",
      total: 10000,
      payment_status: "pending",
      items: [{ product_id: digital, quantity: 1, service_cost: 0 }],
    });
    assert.equal(digitalSale.order_id, null);
    assert.equal(
      (
        await pg.query<{ cost_status: string }>(
          "SELECT cost_status FROM sales WHERE id=$1",
          [digitalSale.id],
        )
      ).rows[0].cost_status,
      "confirmed",
    );
    const direct = await op("direct_order", {
      company_id: sale.company_id,
      product_id: pix,
      quantity: 2,
      notes: "Direto",
    });
    await op("reserve", { id: direct.id });
    await op("order_items", {
      id: direct.id,
      items: [{ product_id: pix, quantity: 1 }],
    });
    assert.equal(
      (
        await pg.query(
          "SELECT * FROM inventory_reservations WHERE order_id=$1 AND status='reserved'",
          [direct.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      pg.query("SELECT axl_mutate('stage',$1::jsonb)", [
        JSON.stringify({ id: sale.company_id, status: "Contato realizado" }),
      ]),
      /operação v2/,
    );
    await pg.exec(`SET request.jwt.claim.sub='${member}'`);
    assert.ok((await pg.query("SELECT axl_state_v2()")).rows.length);
    await op("contact", {
      company_id: sale.company_id,
      type: "Resposta",
      result: "Interessado",
      text: "Resposta registrada pela Laura",
    });
    assert.equal(
      (await pg.query("UPDATE profiles SET role='ADMIN' WHERE id=$1", [member]))
        .affectedRows,
      0,
    );
    await assert.rejects(
      pg.query("SELECT axl_mutate('weights','{}')"),
      /administrador/,
    );
    await pg.exec("RESET ROLE");
    const nfc3 = (
      await pg.query<{ id: string }>(
        "SELECT id FROM inventory_lots WHERE code='NFC-03'",
      )
    ).rows[0].id;
    await pg.exec(
      `SET ROLE authenticated;SET request.jwt.claim.sub='${admin}'`,
    );
    const qtyBeforeReview = (
      await pg.query("SELECT id,quantity FROM inventory_items ORDER BY id")
    ).rows;
    await op("lot_review", {
      id: nfc3,
      current_received: 400,
      date: "2026-10-06",
      notes:
        "Conferência de referência atual; saldo físico contado separadamente",
    });
    assert.deepEqual(
      (await pg.query("SELECT id,quantity FROM inventory_items ORDER BY id"))
        .rows,
      qtyBeforeReview,
    );
    const referenceMaterials = (
      await pg.query<{ id: string; name: string }>(
        "SELECT id,name FROM inventory_items",
      )
    ).rows;
    for (const material of referenceMaterials) {
      if (material.name.startsWith("Base/acrílico"))
        await op("material_cost", {
          id: material.id,
          cost: 340,
          status: "confirmed",
          origin: "Referência atual confirmada no teste",
        });
      if (material.name.startsWith("Adesivo impresso"))
        await op("material_cost", {
          id: material.id,
          cost: 83,
          status: "confirmed",
          origin: "Referência atual confirmada no teste",
        });
    }
    const precise = await op("quick_sale", {
      request_id: "f0000000-0000-4000-8000-000000000010",
      name: "Lote fracionário",
      date: "2026-10-06",
      total: 1000000,
      items: [{ product_id: google, quantity: 400, lot_id: nfc3 }],
    });
    assert.equal(
      (
        await pg.query<{ cost: number }>("SELECT cost FROM sales WHERE id=$1", [
          precise.id,
        ])
      ).rows[0].cost,
      180700,
    );
    const historical = (
      await pg.query(
        "SELECT * FROM inventory_lots WHERE source_key IS NOT NULL",
      )
    ).rows;
    assert.equal(historical.length, 6);
    const countBefore = (await pg.query("SELECT count(*) FROM sales")).rows;
    await pg.exec("RESET ROLE");
    for (const f of [
      "supabase-runtime.sql",
      "supabase-state.sql",
      "disable-v2.sql",
    ])
      await pg.exec(readFileSync("database/" + f, "utf8"));
    await pg.exec(readFileSync("database/update-2026-10-06.sql", "utf8"));
    await pg.exec(
      `SET ROLE authenticated;SET request.jwt.claim.sub='${member}'`,
    );
    assert.deepEqual(
      (await pg.query("SELECT count(*) FROM sales")).rows,
      countBefore,
    );
    assert.ok((await pg.query("SELECT axl_state_v2()")).rows.length);
  } finally {
    await pg.close();
  }
});
