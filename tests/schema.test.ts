import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("schema PostgreSQL cria relações, triggers, UUIDs e RLS restritiva", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$; CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); CREATE TABLE storage.objects(id uuid,bucket_id text); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;`,
    );
    // PGlite tem gen_random_uuid nativo. O pgcrypto é pré-instalado no Supabase.
    const sql = readFileSync("database/supabase.sql", "utf8").replace(
      "CREATE EXTENSION IF NOT EXISTS pgcrypto;",
      "",
    );
    await pg.exec(sql);
    const tables = await pg.query<{ count: number }>(
      "SELECT count(*)::integer AS count FROM pg_tables WHERE schemaname='public' AND rowsecurity",
    );
    assert.equal(tables.rows[0].count, 33);
    const admin = "a0000000-0000-4000-8000-000000000001",
      seller = "a0000000-0000-4000-8000-000000000002";
    await pg.exec(
      `INSERT INTO auth.users(id) VALUES('${admin}'),('${seller}');INSERT INTO public.profiles(id,name,email,role) VALUES('${admin}','Admin','admin@example.com','ADMIN'),('${seller}','Vendedor','v@example.com','VENDEDOR');INSERT INTO public.companies(name,city) VALUES('Empresa privada','Valinhos');GRANT USAGE ON SCHEMA public,auth TO authenticated;GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;SET ROLE authenticated;SET test.uid='${seller}';`,
    );
    assert.equal(
      (await pg.query("SELECT * FROM public.companies")).rows.length,
      0,
    );
    assert.equal(
      (await pg.query("SELECT * FROM public.profiles")).rows.length,
      1,
    );
    await pg.exec(`SET test.uid='${admin}'`);
    assert.equal(
      (await pg.query("SELECT * FROM public.companies")).rows.length,
      1,
    );
    assert.equal(
      (await pg.query("SELECT * FROM public.profiles")).rows.length,
      2,
    );
  } finally {
    await pg.close();
  }
});
