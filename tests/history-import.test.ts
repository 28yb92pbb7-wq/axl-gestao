import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  costKnown,
  paymentKnown,
  saleDate,
  saleInPeriod,
} from "../lib/history";
const admin = "a0000000-0000-4000-8000-000000000001",
  seller = "a0000000-0000-4000-8000-000000000002";
const fixtures = [
  {
    company: "Empresa um",
    segment: "Pet",
    plates: 6,
    total: 28000,
    date: "2026-09-21",
    date_start: "2026-09-21",
    date_end: "2026-09-21",
    date_label: "21/09/2026",
    solution: "Placas",
    notes: "Observação original",
  },
  {
    company: "Empresa dois",
    segment: "Serviços",
    plates: 3,
    total: 10000,
    date: "",
    date_start: "2026-09-26",
    date_end: "2026-09-27",
    date_label: "26–27/09/2026",
    solution: "Pacote + placas",
    notes: "",
  },
  {
    company: "Empresa três",
    segment: "Moda",
    plates: 6,
    total: 25000,
    date: "",
    date_start: "",
    date_end: "",
    date_label: "Sem data precisa",
    solution: "Placas",
    notes: "",
  },
].map((r, i) => ({
  ...r,
  key: createHash("sha256")
    .update("fixture" + i)
    .digest("hex"),
}));
const fixture = {
  filename: "fixture.xlsx",
  sha256: "a".repeat(64),
  rows: fixtures,
  count: 3,
  plates: 15,
  total: 63000,
  file_base64: Buffer.from("fixture-original").toString("base64"),
  sheets: ["Vendas AXL", "Resumo"],
};
async function database() {
  const pg = new PGlite();
  await pg.exec(
    `CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);CREATE TABLE storage.objects(id uuid,bucket_id text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`,
  );
  for (const file of [
    "supabase.sql",
    "supabase-runtime.sql",
    "supabase-state.sql",
    "supabase-import.sql",
  ])
    await pg.exec(
      readFileSync("database/" + file, "utf8").replace(
        "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
        "",
      ),
    );
  await pg.exec(
    `INSERT INTO auth.users VALUES('${admin}'),('${seller}');INSERT INTO profiles(id,name,email,role) VALUES('${admin}','Admin','import-admin@example.com','ADMIN'),('${seller}','Seller','seller@example.com','VENDEDOR');GRANT USAGE ON SCHEMA auth TO authenticated;SET ROLE authenticated;SET request.jwt.claim.sub='${admin}';`,
  );
  return pg;
}
test("histórico preserva totais, datas imprecisas e desconhecidos, sem duplicar ou criar pedidos/pagamentos", async () => {
  const pg = await database();
  try {
    const existing = await pg.query<{ id: string }>(
      "INSERT INTO companies(name,city,phone) VALUES('Empresa um','Valinhos','19999999999') RETURNING id",
    );
    const payload = fixture;
    const run = async (p: unknown) =>
      (
        await pg.query<{ r: { imported: number; skipped: number } }>(
          "SELECT axl_import_history($1::jsonb) r",
          [JSON.stringify(p)],
        )
      ).rows[0].r;
    assert.equal((await run(payload)).imported, 3);
    assert.equal((await run(payload)).skipped, 3);
    const company = await pg.query<{ city: string; phone: string }>(
      "SELECT city,phone FROM companies WHERE id=$1",
      [existing.rows[0].id],
    );
    assert.deepEqual(company.rows[0], {
      city: "Valinhos",
      phone: "19999999999",
    });
    const sums = await pg.query<{
      total: number;
      plates: number;
      cost_known: boolean;
      payment_known: boolean;
    }>(
      "SELECT sum(total)::integer total,sum(plates)::integer plates,bool_or(cost_known) cost_known,bool_or(payment_known) payment_known FROM sales",
    );
    assert.deepEqual(sums.rows[0], {
      total: 63000,
      plates: 15,
      cost_known: false,
      payment_known: false,
    });
    const diff = await pg.query(
      "SELECT s.id FROM sales s JOIN sale_items i ON i.sale_id=s.id GROUP BY s.id HAVING sum(i.quantity*i.price)<>s.total OR sum(i.quantity)<>s.plates",
    );
    assert.equal(diff.rows.length, 0);
    assert.equal((await pg.query("SELECT * FROM orders")).rows.length, 0);
    assert.equal((await pg.query("SELECT * FROM payments")).rows.length, 0);
    assert.equal(
      (await pg.query("SELECT * FROM sales WHERE date IS NULL")).rows.length,
      2,
    );
    assert.equal(
      (await pg.query("SELECT * FROM inventory_movements")).rows.length,
      0,
    );
    const sale = (
      await pg.query<{ id: string }>("SELECT id FROM sales LIMIT 1")
    ).rows[0].id;
    await assert.rejects(
      pg.query("SELECT axl_mutate('payment',$1::jsonb)", [
        JSON.stringify({
          sale_id: sale,
          amount: 100,
          method: "Pix",
          date: "2026-10-06",
        }),
      ]),
      /Concilie/,
    );
    const invalid = {
      ...payload,
      rows: [
        { ...fixtures[0], company: "Não deve persistir", key: "f".repeat(64) },
      ],
      count: 1,
      plates: 6,
      total: 1,
    };
    await assert.rejects(run(invalid), /Totais não conferem/);
    assert.equal(
      (
        await pg.query(
          "SELECT * FROM companies WHERE name='Não deve persistir'",
        )
      ).rows.length,
      0,
    );
    await pg.exec(`SET request.jwt.claim.sub='${seller}'`);
    await assert.rejects(run(payload), /administrador/);
    assert.equal(
      (await pg.query("SELECT * FROM settings WHERE key LIKE 'workbook:%'"))
        .rows.length,
      0,
    );
  } finally {
    await pg.close();
  }
});
test("intervalos não viram datas exatas; histórico inclui vendas sem data e não calcula lucro/cobranças ausentes", () => {
  assert.equal(saleInPeriod(fixtures[1], "2026-09-26", "2026-09-26"), false);
  assert.equal(saleInPeriod(fixtures[1], "2026-09-01", "2026-09-30"), true);
  assert.equal(saleInPeriod(fixtures[2], "2026-09-01", "2026-09-30"), false);
  assert.equal(
    saleInPeriod(fixtures[2], "2026-09-01", "2026-09-30", true),
    true,
  );
  assert.equal(saleDate(fixtures[1]), "26–27/09/2026");
  assert.equal(saleDate(fixtures[2]), "Sem data precisa");
  assert.equal(costKnown({ cost_known: 0 }), false);
  assert.equal(paymentKnown({ payment_known: 0 }), false);
  assert.equal(costKnown({}), true);
});
// Arquivo privado do usuário não entra no repositório. Quando presente, valida a SQL completa preparada.
test(
  "arquivo de importação preparado confere no PostgreSQL",
  { skip: !existsSync(".data/importacao/IMPORTAR_AXL.sql") },
  async () => {
    const pg = await database();
    try {
      const payload = JSON.parse(
        readFileSync(".data/importacao/payload.json", "utf8"),
      );
      await pg.exec("RESET ROLE");
      await pg.query("UPDATE profiles SET email=$1 WHERE id=$2", [
        payload.admin_email,
        admin,
      ]);
      await pg.exec(readFileSync(".data/importacao/IMPORTAR_AXL.sql", "utf8"));
      await pg.exec(readFileSync(".data/importacao/IMPORTAR_AXL.sql", "utf8"));
      const totals = await pg.query<{
        count: number;
        plates: number;
        total: number;
      }>(
        "SELECT count(*)::integer count,sum(plates)::integer plates,sum(total)::integer total FROM sales WHERE import_source=$1",
        [payload.filename],
      );
      assert.deepEqual(totals.rows[0], {
        count: payload.count,
        plates: payload.plates,
        total: payload.total,
      });
      const original = (
        await pg.query<{ value: { file_base64: string } }>(
          "SELECT value FROM settings WHERE key=$1",
          ["workbook:" + payload.sha256],
        )
      ).rows[0].value;
      assert.equal(
        createHash("sha256")
          .update(Buffer.from(original.file_base64, "base64"))
          .digest("hex"),
        payload.sha256,
      );
      assert.equal(
        (
          await pg.query(
            "SELECT s.id FROM sales s JOIN sale_items i ON i.sale_id=s.id GROUP BY s.id HAVING sum(i.quantity*i.price)<>s.total OR sum(i.quantity)<>s.plates",
          )
        ).rows.length,
        0,
      );
    } finally {
      await pg.close();
    }
  },
);
