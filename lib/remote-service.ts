import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "./integrations/supabase-server";
import { supabaseForUser } from "./integrations/supabase";
import { parseMutation, mutationSchemas } from "./mutation-schemas";
import type { State } from "./types";
import type { User } from "./auth";
const flags = new Set([
  "active",
  "is_customer",
  "is_lead",
  "is_plate",
  "uses_nfc",
  "uses_acrylic",
  "controls_stock",
  "paid",
  "done",
  "cost_known",
  "payment_known",
]);
export function normalizeRemoteState(data: Record<string, unknown>): State {
  const normalized: Record<string, unknown> = { ...data, backend: "supabase" };
  for (const [key, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) continue;
    normalized[key] = rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([field, value]) => {
          if (flags.has(field) && typeof value === "boolean")
            return [field, Number(value)];
          if (
            ["components_snapshot", "commission_rule"].includes(field) &&
            typeof value === "object"
          )
            return [field, JSON.stringify(value)];
          if (
            ["created_at", "updated_at", "produced_at"].includes(field) &&
            typeof value === "string" &&
            value
          )
            return [
              field,
              new Date(value).toISOString().slice(0, 19).replace("T", " "),
            ];
          return [field, value ?? ""];
        }),
      ),
    );
  }
  return normalized as State;
}
function databaseError(error: { code?: string; message: string }) {
  if (error.code === "23505")
    return new Error("Já existe um registro com este identificador.");
  if (error.code === "23503")
    return new Error("Um dos registros relacionados não existe.");
  if (error.code === "PGRST202" || error.code === "42883")
    return new Error(
      "Aplique as migrações de configuração AXL no projeto Supabase.",
    );
  if (error.code === "P0001") return new Error(error.message);
  return new Error(
    "Não foi possível concluir a operação no Supabase. Confira a configuração e tente novamente.",
  );
}
export async function readRemoteState() {
  const client = await supabaseServer();
  const { data, error } = await client.rpc("axl_state");
  if (error) throw databaseError(error);
  const { data: archives, error: archivesError } = await client
    .from("settings")
    .select("value")
    .like("key", "workbook:%")
    .limit(20);
  if (archivesError) throw databaseError(archivesError);
  data.imports = (archives || []).map(({ value }) => {
    const { sha256, filename, count, plates, total, imported_at } = value;
    return { sha256, filename, count, plates, total, imported_at };
  });
  return normalizeRemoteState(data);
}
export async function mutateRemote(action: string, input: unknown, user: User) {
  if (user.role !== "ADMIN")
    throw new Error("Acesso restrito ao administrador.");
  const parsed = parseMutation(action, input);
  const client = await supabaseServer();
  if (action === "user") {
    const d = mutationSchemas.user.parse(input);
    const key = process.env.SUPABASE_ADMIN_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url || !key)
      throw new Error(
        "Para criar usuários, use o painel Supabase Auth ou configure SUPABASE_ADMIN_KEY somente no servidor.",
      );
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.admin.createUser({
      email: d.email,
      password: d.password,
      email_confirm: true,
      user_metadata: { name: d.name },
    });
    if (error || !data.user)
      throw new Error(
        "Não foi possível criar o usuário. Confira e-mail e configuração administrativa.",
      );
    const created = data.user.id;
    const { error: profileError } = await client.from("profiles").insert({
      id: created,
      email: d.email.toLowerCase(),
      name: d.name,
      role: d.role,
    });
    if (profileError) {
      const { error: rollbackError } =
        await admin.auth.admin.deleteUser(created);
      if (rollbackError)
        throw new Error(
          "Usuário Auth criado sem perfil. Corrija seu cadastro no painel Supabase.",
        );
      throw databaseError(profileError);
    }
    await client.rpc("axl_audit", {
      p_action: "Usuário criado",
      p_id: created,
      p_entity: "profiles",
    });
    return created;
  }
  if (action === "password") {
    const d = mutationSchemas.password.parse(input);
    const verification = supabaseForUser();
    const { error } = await verification.auth.signInWithPassword({
      email: user.email,
      password: d.current_password,
    });
    if (error) throw new Error("Senha atual incorreta.");
    await verification.auth.signOut({ scope: "local" });
    const { error: updateError } = await client.auth.updateUser({
      password: d.new_password,
    });
    if (updateError)
      throw new Error("Não foi possível alterar a senha no Supabase.");
    await client.rpc("axl_audit", {
      p_action: "Senha alterada",
      p_id: user.id,
      p_entity: "profiles",
    });
    return true;
  }
  const { data, error } = await client.rpc("axl_mutate", {
    p_action: action,
    p_data: parsed,
  });
  if (error) throw databaseError(error);
  return data?.id ?? true;
}
