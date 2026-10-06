import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const admin = "a0000000-0000-4000-8000-000000000001",
  seller = "a0000000-0000-4000-8000-000000000002";
test("operações Supabase/RPC preservam histórico, transações e acesso por perfil", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`,
    );
    for (const file of [
      "supabase.sql",
      "supabase-runtime.sql",
      "supabase-state.sql",
    ])
      await pg.exec(
        readFileSync("database/" + file, "utf8").replace(
          "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
          "",
        ),
      );
    await pg.exec(
      `INSERT INTO auth.users(id) VALUES('${admin}'),('${seller}');INSERT INTO profiles(id,name,email,role) VALUES('${admin}','Admin','admin@example.com','ADMIN'),('${seller}','Vendedor','seller@example.com','VENDEDOR');GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated;SET test.uid='${admin}';`,
    );
    async function mutate(action: string, data: unknown) {
      const r = await pg.query<{ result: { id: string } }>(
        "SELECT axl_mutate($1,$2::jsonb) result",
        [action, JSON.stringify(data)],
      );
      return r.rows[0].result.id;
    }
    const company = await mutate("company", {
      name: "Empresa teste",
      city: "Valinhos",
      is_lead: true,
    });
    const material = await mutate("inventory", {
      name: "Tag",
      unit: "un",
      minimum: 2,
      cost: 79,
      supplier: "",
    });
    await mutate("stock", {
      id: material,
      type: "Entrada",
      quantity: 10,
      description: "Estoque para teste",
    });
    const product = await mutate("product", {
      name: "Placa teste",
      sku: "TEST",
      category: "Placas NFC",
      price: 6000,
      cost: 462,
      controls_stock: true,
    });
    await mutate("components", {
      product_id: product,
      components: [{ inventory_id: material, quantity: 1 }],
    });
    const sale = await mutate("sale", {
      company_id: company,
      date: "2026-10-06",
      method: "Pix",
      paid: 3000,
      due_date: "2026-10-10",
      items: [{ product_id: product, quantity: 2, price: 6000 }],
    });
    const r = await pg.query<{ total: number; cost: number }>(
      "SELECT total,cost FROM sales WHERE id=$1",
      [sale],
    );
    assert.equal(r.rows[0].total, 12000);
    assert.equal(r.rows[0].cost, 158);
    await mutate("inventory", {
      id: material,
      name: "Tag",
      unit: "un",
      minimum: 2,
      cost: 200,
      supplier: "",
    });
    await mutate("components", {
      product_id: product,
      components: [{ inventory_id: material, quantity: 5 }],
    });
    assert.equal(
      (
        await pg.query<{ cost: number }>(
          "SELECT cost FROM sale_items WHERE sale_id=$1",
          [sale],
        )
      ).rows[0].cost,
      79,
    );
    await assert.rejects(
      mutate("payment", {
        sale_id: sale,
        amount: 10000,
        method: "Pix",
        date: "2026-10-06",
      }),
      /supera/,
    );
    await mutate("payment", {
      sale_id: sale,
      amount: 9000,
      method: "Pix",
      date: "2026-10-06",
    });
    const order = (
      await pg.query<{ id: string }>("SELECT id FROM orders WHERE sale_id=$1", [
        sale,
      ])
    ).rows[0].id;
    await assert.rejects(mutate("produce", { id: order }), /Aprove/);
    await mutate("order", { id: order, status: "Arte aprovada" });
    await mutate("produce", { id: order });
    await assert.rejects(mutate("produce", { id: order }), /já produzido/);
    assert.equal(
      Number(
        (
          await pg.query<{ quantity: string }>(
            "SELECT quantity FROM inventory_items WHERE id=$1",
            [material],
          )
        ).rows[0].quantity,
      ),
      8,
    );
    await mutate("purchase", {
      inventory_id: material,
      supplier: "Fornecedor",
      quantity: 2,
      total: 200,
      date: "2026-10-06",
      paid: true,
    });
    assert.equal(
      (
        await pg.query<{ cost: number }>(
          "SELECT cost FROM inventory_items WHERE id=$1",
          [material],
        )
      ).rows[0].cost,
      180,
    );
    const goal = (
      await pg.query<{ id: string }>(
        "INSERT INTO goals(period,amount) VALUES('Diária',100000) RETURNING id",
      )
    ).rows[0].id;
    await mutate("goal", { id: goal, amount: 120000 });
    await mutate("expense", {
      description: "Combustível",
      category: "Combustível",
      amount: 5000,
      date: "2026-10-06",
      paid: true,
    });
    await mutate("stage", { id: company, status: "Interessado" });
    await assert.rejects(
      mutate("stage", { id: company, status: "Perdido", reason: "" }),
      /motivo/,
    );
    await mutate("activity", {
      company_id: company,
      type: "Observação",
      description: "Histórico próprio",
    });
    const followup = await mutate("followup", {
      company_id: company,
      date: "2026-10-08T14:00",
      reason: "Retornar",
      responsible: "Equipe",
    });
    await mutate("followup_done", { id: followup });
    const salesperson = await mutate("seller", {
      name: "Equipe",
      email: "team@example.com",
      city: "Valinhos",
      commission_type: "percent",
      commission_value: 5,
    });
    const route = await mutate("route", {
      name: "Centro",
      date: "2026-10-08",
      salesperson_id: salesperson,
      companies: [company],
    });
    const stop = (
      await pg.query<{ id: string }>(
        "SELECT id FROM route_stops WHERE route_id=$1",
        [route],
      )
    ).rows[0].id;
    await mutate("stop", { id: stop, status: "Visitado" });
    await mutate("weights", {
      rating: 25,
      reviews: 25,
      phone: 10,
      website: 10,
      segment: 15,
      contact: 10,
      other: 5,
    });
    const state = (
      await pg.query<{
        state: {
          companies: unknown[];
          sales: { paid: number }[];
          profiles: unknown[];
          orders: { status: string }[];
          goals: { amount: number }[];
        };
      }>("SELECT axl_state() state")
    ).rows[0].state;
    assert.equal(state.companies.length, 1);
    assert.equal(state.sales[0].paid, 12000);
    assert.equal(state.orders[0].status, "Pronto para entrega");
    assert.equal(state.goals[0].amount, 120000);
    await pg.exec(`SET test.uid='${seller}'`);
    await assert.rejects(
      mutate("company", { name: "Proibido", city: "Valinhos" }),
      /administrador/,
    );
    await assert.rejects(pg.query("SELECT axl_state()"), /administrador/);
    assert.equal((await pg.query("SELECT * FROM sales")).rows.length, 0);
  } finally {
    await pg.close();
  }
});
