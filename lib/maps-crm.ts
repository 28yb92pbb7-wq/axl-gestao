import { z } from "zod";
import { supabaseEnabled } from "./backend";
import { supabaseServer } from "./integrations/supabase-server";
import { validateMapsUrl } from "./maps-links";
import { getMapsPreview } from "./maps-import";
import { companySchema } from "./domain";
import { operationalRole } from "./operations-schema";
import type { User } from "./auth";
import { db, all, one, run, insert, transaction, activity, audit } from "./db";
export function initMapsCrm() {
  db().exec(
    `CREATE TABLE IF NOT EXISTS company_map_links(company_id TEXT PRIMARY KEY REFERENCES companies(id),url TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'Link informado',consulted_at TEXT,place_id TEXT,user_id TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE UNIQUE INDEX IF NOT EXISTS map_links_url ON company_map_links(url);`,
  );
}
export async function readMapLinks() {
  if (supabaseEnabled()) {
    const c = await supabaseServer();
    const { data, error } = await c
      .from("company_map_links")
      .select("company_id,url,place_id,source,consulted_at");
    if (error?.code === "42P01" || error?.code === "PGRST205") return [];
    if (error) throw new Error("Não foi possível ler os links das empresas.");
    return data || [];
  }
  initMapsCrm();
  return all(
    "SELECT company_id,url,place_id,source,consulted_at FROM company_map_links",
  );
}
export async function saveMapsCompany(input: unknown, user: User) {
  if (!operationalRole(user.role))
    throw new Error("Somente a equipe pode cadastrar empresas no CRM.");
  const d = z
    .object({
      url: z.string().max(4096),
      token: z.uuid().optional(),
      company_id: z.uuid().optional(),
      new_homonym: z.boolean().default(false),
      fields: companySchema,
    })
    .parse(input);
  const url = validateMapsUrl(d.url).href;
  const preview = d.token ? getMapsPreview(d.token, user.id) : undefined;
  const fields = {
    ...d.fields,
    place_id: preview?.place.id || null,
    origin: preview ? "Google Maps · link" : "Link Google Maps · manual",
  };
  // A ficha da API nunca é inserida. fields contém apenas informações próprias digitadas separadamente.
  if (supabaseEnabled()) {
    const c = await supabaseServer();
    const { data, error } = await c.rpc("axl_maps_save", {
      d: {
        ...d,
        url,
        fields,
        place_id: fields.place_id,
        consulted_at: preview ? new Date().toISOString() : null,
      },
    });
    if (error)
      throw new Error(
        error.code === "P0001"
          ? error.message
          : "Aplique a atualização de links e loja no Supabase.",
      );
    return data;
  }
  initMapsCrm();
  return transaction(() => {
    const duplicate = one<{ id: string; place_id: string }>(
      "SELECT c.id,c.place_id FROM companies c LEFT JOIN company_map_links m ON m.company_id=c.id WHERE (c.place_id IS NOT NULL AND c.place_id=?) OR m.url=?",
      fields.place_id,
      url,
    );
    if (
      duplicate &&
      fields.place_id &&
      duplicate.place_id &&
      duplicate.place_id !== fields.place_id
    )
      throw new Error(
        "O link salvo está associado a outro Place ID. Confira a ficha antes de alterar.",
      );
    if (duplicate) return { id: duplicate.id, existing: true };
    const id = d.company_id || undefined;
    if (id && !one("SELECT id FROM companies WHERE id=?", id))
      throw new Error("Empresa não encontrada.");
    if (
      !id &&
      !d.new_homonym &&
      one("SELECT id FROM companies WHERE lower(name)=lower(?)", fields.name)
    )
      throw new Error(
        "Possível homônimo. Selecione a ficha existente ou confirme uma empresa distinta.",
      );
    const created =
      id ||
      insert("companies", {
        ...fields,
        is_customer: Number(fields.is_customer),
        is_lead: Number(fields.is_lead),
      });
    if (id && fields.place_id) {
      const existing = one<{ place_id: string }>(
        "SELECT place_id FROM companies WHERE id=?",
        id,
      );
      if (existing?.place_id && existing.place_id !== fields.place_id)
        throw new Error("Esta ficha já está associada a outra empresa Google.");
      run("UPDATE companies SET place_id=? WHERE id=?", fields.place_id, id);
    }
    run(
      "INSERT INTO company_map_links(company_id,url,source,consulted_at,place_id,user_id) VALUES(?,?,?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET url=excluded.url,source=excluded.source,consulted_at=excluded.consulted_at,place_id=excluded.place_id,user_id=excluded.user_id,updated_at=CURRENT_TIMESTAMP",
      created,
      url,
      preview ? "Google Maps" : "Link informado",
      preview ? new Date().toISOString() : null,
      fields.place_id,
      user.id,
    );
    activity(
      created,
      user.id,
      "Google Maps",
      "Link associado; campos próprios e histórico preservados.",
    );
    audit(user.id, "Empresa adicionada pelo link", created);
    return { id: created, existing: !!id };
  });
}
