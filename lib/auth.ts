import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { cookies } from "next/headers";
import { one, run } from "./db";
import { supabaseEnabled } from "./backend";
import { supabaseServer } from "./integrations/supabase-server";
export type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "VENDEDOR" | "PRODUCAO" | "FINANCEIRO";
};
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;
  const input = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return expected.length === input.length && timingSafeEqual(input, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function currentUser() {
  if (supabaseEnabled()) {
    const client = await supabaseServer();
    const {
      data: { user },
      error,
    } = await client.auth.getUser();
    if (error || !user) return undefined;
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id,email,name,role")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) return undefined;
    return profile as User;
  }

  const token = (await cookies()).get("axl_session")?.value;
  if (!token) return undefined;
  return one<User>(
    "SELECT p.id,p.email,p.name,p.role FROM sessions s JOIN profiles p ON p.id=s.user_id WHERE s.id=? AND s.expires_at>?",
    tokenHash(token),
    new Date().toISOString(),
  );
}
export async function login(email: string, password: string) {
  if (supabaseEnabled()) {
    const client = await supabaseServer();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      if (
        error.code === "invalid_api_key" ||
        /invalid api key/i.test(error.message)
      )
        throw new Error(
          "A chave pública do Supabase foi recusada. Confira NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel e faça um novo deploy.",
        );
      if (error.code === "email_not_confirmed")
        throw new Error(
          "Seu e-mail ainda não foi confirmado no Supabase. Confirme o cadastro antes de entrar.",
        );
      if (error.code !== "invalid_credentials")
        throw new Error(
          "Não foi possível autenticar no Supabase. Confira a configuração do projeto e tente novamente.",
        );
      return false;
    }
    if (!data.user) return false;
    const { data: profile } = await client
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();
    if (!profile || profile.role !== "ADMIN") {
      await client.auth.signOut({ scope: "local" });
      throw new Error(
        "Seu usuário ainda não tem perfil de administrador AXL. Conclua a configuração do projeto Supabase.",
      );
    }
    return true;
  }

  if (
    process.env.NODE_ENV === "production" &&
    process.env.AXL_ALLOW_LOCAL_AUTH !== "true"
  )
    throw new Error(
      "Login local desabilitado em produção. Configure o ambiente conforme o README.",
    );
  const user = one<User & { password_hash: string }>(
    "SELECT * FROM profiles WHERE email=?",
    email.toLowerCase(),
  );
  if (!user || !verifyPassword(password, user.password_hash)) return false;
  const token = randomBytes(32).toString("hex");
  run("DELETE FROM sessions WHERE expires_at<?", new Date().toISOString());
  run(
    "INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)",
    tokenHash(token),
    user.id,
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  );
  (await cookies()).set("axl_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return true;
}
export async function logout() {
  if (supabaseEnabled()) {
    const client = await supabaseServer();
    await client.auth.signOut({ scope: "local" });
    return;
  }

  const cookie = await cookies();
  const token = cookie.get("axl_session")?.value;
  if (token) run("DELETE FROM sessions WHERE id=?", tokenHash(token));
  cookie.delete("axl_session");
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      parsed.host === request.headers.get("host")
    );
  } catch {
    return false;
  }
}
