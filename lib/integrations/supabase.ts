/** Cliente HTTP Supabase. AXL_BACKEND seleciona banco/login local ou remoto.
 * Tokens do usuário devem vir de Supabase Auth. Nunca envie service_role ao navegador.
 */
import { createClient } from "@supabase/supabase-js";
export function supabaseForUser(accessToken?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error("Configure a URL e a chave pública do projeto Supabase.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : undefined,
  });
}
export async function supabaseSignIn(email: string, password: string) {
  const client = supabaseForUser();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error)
    throw new Error(
      "Não foi possível entrar no Supabase. Confira usuário e configuração.",
    );
  return data;
}
export async function uploadSupabaseAttachment(
  token: string,
  file: Blob,
  recordId: string,
) {
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) throw new Error("Registro inválido.");
  if (file.size > 10 * 1024 * 1024)
    throw new Error("O arquivo deve ter até 10 MB.");
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };
  if (!extensions[file.type]) throw new Error("Envie PNG, JPG, WebP ou PDF.");
  const client = supabaseForUser(token);
  const key = `${recordId}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const { error } = await client.storage
    .from("axl-files")
    .upload(key, file, { contentType: file.type, upsert: false });
  if (error)
    throw new Error(
      "Não foi possível enviar o arquivo. Confira o bucket e as permissões.",
    );
  return key;
}
