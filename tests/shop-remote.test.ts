import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const admin = "b0000000-0000-4000-8000-000000000001",
  buyer = "b0000000-0000-4000-8000-000000000002",
  other = "b0000000-0000-4000-8000-000000000003";
test("Supabase: migração repetível, compradores isolados, pagamento único, arte, MCP e revogação", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `CREATE ROLE authenticated;CREATE ROLE anon;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text,name text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`,
    );
    for (const f of [
      "supabase.sql",
      "supabase-runtime.sql",
      "supabase-state.sql",
      "supabase-import.sql",
      "update-2026-10-06-completo.sql",
      "update-2026-10-06-completo.sql",
    ])
      await pg.exec(
        readFileSync("database/" + f, "utf8").replace(
          "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
          "",
        ),
      );
    await pg.exec(
      `INSERT INTO auth.users VALUES('${admin}','admin@test.invalid',NULL),('${buyer}','buyer@test.invalid','{"axl_shop":true,"name":"Comprador","phone":"11999999999"}'),('${other}','other@test.invalid','{"axl_shop":true,"name":"Outro","phone":"11999999999"}');INSERT INTO profiles(id,name,email,role) VALUES('${admin}','Alex','admin@test.invalid','ADMIN');GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated;SET request.jwt.claim.sub='${admin}';`,
    );
    const rpc = async (a: string, d: unknown) =>
      (
        await pg.query<{ v: { id: string; number: number } }>(
          "SELECT shop_mutate($1,$2::jsonb) v",
          [a, JSON.stringify(d)],
        )
      ).rows[0].v;
    const p = (
      await pg.query<{ id: string }>(
        "SELECT id FROM products WHERE sku='AXL-PIX-QR'",
      )
    ).rows[0].id;
    await rpc("settings", {
      business_name: "AXL teste",
      business_details: "Dados de teste",
      support: "Atendimento teste",
      purchase_policy: "Política teste",
      privacy: "Privacidade teste",
      cancellation_policy: "Cancelamento teste",
      pix_payload: "Chave teste",
      payment_terms: "Pagamento teste",
      payment_hours: 24,
      delivery: [
        {
          id: "retirada",
          label: "Retirada",
          needs_address: false,
          fee: 0,
          area: "Local teste",
          transport_days: 0,
        },
      ],
    });
    await rpc("listing", {
      product_id: p,
      published: true,
      description: "Placa teste",
      price: 5000,
      quantity_available: 10,
      production_days: 2,
      availability: "made_to_order",
      personalization: "pix",
      tiers: [],
      options: [],
      components: [],
    });
    const checkout = {
      request_id: "c0000000-0000-4000-8000-000000000001",
      delivery_id: "retirada",
      items: [
        {
          product_id: p,
          quantity: 2,
          price: 1,
          option: "",
          personalization: {},
        },
      ],
    };
    await pg.exec(`SET request.jwt.claim.sub='${buyer}'`);
    await assert.rejects(rpc("checkout", checkout), /aprovado/);
    await assert.rejects(
      rpc("approval", { id: buyer, status: "approved" }),
      /administrador/,
    );
    await assert.rejects(
      pg.query("SELECT axl_state_v2()"),
      /autorizado|restrito/,
    );
    await pg.exec(`SET request.jwt.claim.sub='${admin}'`);
    await rpc("approval", { id: buyer, status: "approved" });
    await pg.exec(`SET request.jwt.claim.sub='${buyer}'`);
    const order = await rpc("checkout", checkout);
    assert.equal((await rpc("checkout", checkout)).id, order.id);
    const own = (
      await pg.query<{ v: { orders: { data: { total: number } }[] } }>(
        "SELECT shop_state() v",
      )
    ).rows[0].v;
    assert.equal(own.orders[0].data.total, 10000);
    await pg.exec(`SET request.jwt.claim.sub='${other}'`);
    assert.equal(
      (await pg.query<{ v: { orders: unknown[] } }>("SELECT shop_state() v"))
        .rows[0].v.orders.length,
      0,
    );
    await assert.rejects(
      rpc("personalization", {
        id: order.id,
        index: 0,
        values: { pix_payload: "test" },
      }),
      /não encontrado/,
    );
    await pg.exec(`SET request.jwt.claim.sub='${admin}'`);
    await rpc("payment_confirm", {
      id: order.id,
      date: "2026-10-06",
      confirmed: true,
    });
    await rpc("payment_confirm", {
      id: order.id,
      date: "2026-10-06",
      confirmed: true,
    });
    assert.equal((await pg.query("SELECT * FROM sales")).rows.length, 1);
    assert.equal((await pg.query("SELECT * FROM payments")).rows.length, 1);
    assert.equal((await pg.query("SELECT * FROM orders")).rows.length, 1);
    const oid = (await pg.query<{ id: string }>("SELECT id FROM orders"))
      .rows[0].id;
    await assert.rejects(
      pg.query(
        "UPDATE orders SET produced_at=now(),status='Pronto para entrega' WHERE id=$1",
        [oid],
      ),
      /arte aprovada/,
    );
    await pg.exec(`SET request.jwt.claim.sub='${buyer}'`);
    await rpc("personalization", {
      id: order.id,
      index: 0,
      values: { pix_payload: "test" },
    });
    await pg.exec(`SET request.jwt.claim.sub='${admin}'`);
    const art = (
      await pg.query<{ v: string }>("SELECT shop_asset_register($1::jsonb) v", [
        JSON.stringify({
          order_id: order.id,
          kind: "art",
          filename: "arte.png",
          mime: "image/png",
          storage_path: `shop/${order.id}/d0000000-0000-4000-8000-000000000001.png`,
        }),
      ])
    ).rows[0].v;
    await pg.exec(`SET request.jwt.claim.sub='${buyer}'`);
    await rpc("art_approve", { id: order.id, asset_id: art });
    await pg.exec(`SET request.jwt.claim.sub='${admin}'`);
    await rpc("refund", {
      id: order.id,
      date: "2026-10-06",
      reason: "Teste estorno",
      confirmed: true,
    });
    await rpc("refund", {
      id: order.id,
      date: "2026-10-06",
      reason: "Teste estorno",
      confirmed: true,
    });
    assert.equal((await pg.query("SELECT * FROM expenses")).rows.length, 1);
    // OAuth e ações: RLS bloqueia tabelas de credenciais. Somente hashes privados em funções específicas.
    const client = "x".repeat(43),
      codeHash = "1".repeat(64),
      tokenHash = "2".repeat(64),
      res = "https://axl.test/api/mcp";
    await pg.query("SELECT assistant_register($1::jsonb)", [
      JSON.stringify({
        id: client,
        name: "Teste",
        redirect_uris: ["https://client.test/callback"],
      }),
    ]);
    await pg.query("SELECT assistant_issue($1::jsonb)", [
      JSON.stringify({
        hash: codeHash,
        client_id: client,
        redirect_uri: "https://client.test/callback",
        code_challenge: "a".repeat(43),
        scope: "axl:read axl:write",
        resource: res,
      }),
    ]);
    await pg.exec("SET ROLE anon");
    await assert.rejects(
      pg.query("SELECT * FROM assistant_tokens"),
      /permission denied/,
    );
    await pg.query("SELECT assistant_exchange($1::jsonb)", [
      JSON.stringify({
        code_hash: codeHash,
        client_id: client,
        redirect_uri: "https://client.test/callback",
        challenge: "a".repeat(43),
        resource: res,
        token_hash: tokenHash,
      }),
    ]);
    const command = {
      request_id: "c0000000-0000-4000-8000-000000000002",
      name: "Venda assistente teste",
      date: "2026-10-06",
      total: 10000,
      payment_status: "unknown",
      items: [{ product_id: p, quantity: 2 }],
    };
    const execute = async (d: unknown) =>
      (
        await pg.query<{ v: { id: string } }>(
          "SELECT assistant_execute($1,$2,$3,$4::jsonb) v",
          [tokenHash, res, "registrar_venda", JSON.stringify(d)],
        )
      ).rows[0].v;
    const sale = await execute(command);
    assert.equal((await execute(command)).id, sale.id);
    await assert.rejects(
      execute({ ...command, total: 5000 }),
      /dados diferentes/,
    );
    await assert.rejects(
      pg.query(
        "SELECT assistant_execute($1,'https://other.test/api/mcp','consultar_resumo','{}')",
        [tokenHash],
      ),
      /revogada/,
    );
    await pg.exec(
      `SET ROLE authenticated;SET request.jwt.claim.sub='${admin}'`,
    );
    const connections = (
      await pg.query<{ v: { id: string; hash?: string }[] }>(
        "SELECT assistant_connections() v",
      )
    ).rows[0].v;
    assert.equal(connections[0].hash, undefined);
    await pg.query("SELECT assistant_connections($1)", [connections[0].id]);
    await pg.exec("SET ROLE anon");
    await assert.rejects(execute(command), /revogada/);
  } finally {
    await pg.close();
  }
});
