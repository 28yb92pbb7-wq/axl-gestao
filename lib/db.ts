import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, readFileSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
const globalDb = globalThis as unknown as { axlDb?: DatabaseSync };
export function db() {
  if (process.env.VERCEL)
    throw new Error(
      "Configure AXL_BACKEND=supabase antes de usar a aplicação na Vercel. O banco local não oferece persistência nesta hospedagem.",
    );
  if (!globalDb.axlDb) {
    const file = path.resolve(
      /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
        ".data/axl.sqlite",
    );
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    globalDb.axlDb = new DatabaseSync(file);
    chmodSync(file, 0o600);
    globalDb.axlDb.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
    globalDb.axlDb.exec(
      readFileSync(path.join(process.cwd(), "database/local.sql"), "utf8"),
    );
    // Migração incremental para instâncias que já executaram a versão inicial.
    for (const table of ["sales", "sale_items"]) {
      const columns = globalDb.axlDb
        .prepare(`PRAGMA table_info(${table})`)
        .all();
      if (!columns.some((c) => c.name === "margin")) {
        globalDb.axlDb.exec(
          `ALTER TABLE ${table} ADD COLUMN margin REAL NOT NULL DEFAULT 0; UPDATE ${table} SET margin=CASE WHEN ${"sales" === table ? "total" : "price"}>0 THEN 100.0*(${"sales" === table ? "total" : "price"}-cost)/${"sales" === table ? "total" : "price"} ELSE 0 END;`,
        );
      }
    }
    const companyColumns = globalDb.axlDb
      .prepare("PRAGMA table_info(companies)")
      .all();
    if (!companyColumns.some((c) => c.name === "is_lead"))
      globalDb.axlDb.exec(
        "ALTER TABLE companies ADD COLUMN is_lead INTEGER NOT NULL DEFAULT 1;",
      );
    globalDb.axlDb.exec(
      "INSERT OR IGNORE INTO migrations(version) VALUES(2),(3);",
    );
  }
  return globalDb.axlDb;
}
export function all<T = Record<string, unknown>>(
  sql: string,
  ...args: SQLInputValue[]
) {
  return db()
    .prepare(sql)
    .all(...args)
    .map((row) => ({ ...row })) as T[];
}
export function one<T = Record<string, unknown>>(
  sql: string,
  ...args: SQLInputValue[]
) {
  const row = db()
    .prepare(sql)
    .get(...args);
  return row ? ({ ...row } as T) : undefined;
}
export function run(sql: string, ...args: SQLInputValue[]) {
  return db()
    .prepare(sql)
    .run(...args);
}
export function insert(table: string, data: Record<string, SQLInputValue>) {
  const id = randomUUID();
  const row = { id, ...data };
  const keys = Object.keys(row);
  run(
    `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`,
    ...Object.values(row),
  );
  return id;
}
export function transaction<T>(fn: () => T) {
  db().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db().exec("COMMIT");
    return result;
  } catch (error) {
    db().exec("ROLLBACK");
    throw error;
  }
}
export function audit(user: string, action: string, entity: string) {
  insert("audit_logs", { user_id: user, action, entity_id: entity });
}
export function activity(
  company: string,
  user: string,
  type: string,
  description: string,
) {
  insert("activities", {
    company_id: company,
    user_id: user,
    type,
    description,
  });
}
