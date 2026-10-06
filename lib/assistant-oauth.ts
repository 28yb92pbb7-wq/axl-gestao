import { randomBytes, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { supabaseEnabled } from "./backend";
import { supabaseForUser } from "./integrations/supabase";
import { supabaseServer } from "./integrations/supabase-server";
import { db, one, run, transaction, all } from "./db";
import { operationalRole } from "./operations-schema";
import type { User } from "./auth";
export const opaque = () => randomBytes(32).toString("base64url");
export const digest = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export const challenge = (s: string) =>
  createHash("sha256").update(s).digest("base64url");
export function resource(origin: string) {
  return new URL("/api/mcp", origin).href;
}
export function initAssistant() {
  db().exec(
    `CREATE TABLE IF NOT EXISTS assistant_clients(id TEXT PRIMARY KEY,name TEXT,redirect_uris TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS assistant_codes(hash TEXT PRIMARY KEY,user_id TEXT,client_id TEXT,redirect_uri TEXT,challenge TEXT,scope TEXT,resource TEXT,expires_at TEXT);CREATE TABLE IF NOT EXISTS assistant_tokens(hash TEXT PRIMARY KEY,id TEXT UNIQUE NOT NULL,user_id TEXT,client_id TEXT,scope TEXT,resource TEXT,expires_at TEXT,revoked INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS assistant_operations(user_id TEXT,request_id TEXT,action TEXT,payload TEXT,result TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,request_id));`,
  );
}
export const registrationSchema = z.object({
  client_name: z.string().max(100).default("Assistente AXL"),
  redirect_uris: z.array(z.url().max(2048)).min(1).max(10),
  token_endpoint_auth_method: z.literal("none").default("none"),
  grant_types: z
    .array(z.literal("authorization_code"))
    .default(["authorization_code"]),
  response_types: z.array(z.literal("code")).default(["code"]),
});
export function validateRedirect(uri: string) {
  const u = new URL(uri);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash ||
    u.port ||
    u.hostname === "localhost" ||
    /^[\d.]+$/.test(u.hostname) ||
    u.hostname.includes(":")
  )
    throw new Error(
      "Use redirecionamento HTTPS público sem credenciais ou fragmento.",
    );
  return u.href;
}
export async function registerClient(input: unknown) {
  const d = registrationSchema.parse(input);
  d.redirect_uris = d.redirect_uris.map(validateRedirect);
  const id = opaque();
  if (supabaseEnabled()) {
    const c = supabaseForUser();
    const { error } = await c.rpc("assistant_register", {
      d: { id, name: d.client_name, redirect_uris: d.redirect_uris },
    });
    if (error) throw new Error("Não foi possível registrar a conexão.");
  } else {
    initAssistant();
    if (
      (one<{ n: number }>("SELECT COUNT(*) n FROM assistant_clients")?.n || 0) >
      1000
    )
      throw new Error("Limite de conexões atingido.");
    run(
      "INSERT INTO assistant_clients(id,name,redirect_uris) VALUES(?,?,?)",
      id,
      d.client_name,
      JSON.stringify(d.redirect_uris),
    );
  }
  return { client_id: id, ...d };
}
export const authorizeSchema = z.object({
  client_id: z.string().min(10).max(200),
  redirect_uri: z.url().max(2048),
  response_type: z.literal("code"),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal("S256"),
  resource: z.url(),
  scope: z.enum(["axl:read", "axl:read axl:write"]).default("axl:read"),
  state: z.string().max(2000).default(""),
});
export async function issueCode(input: unknown, user: User, origin: string) {
  const d = authorizeSchema.parse(input);
  if (d.resource !== resource(origin) || !operationalRole(user.role))
    throw new Error("Recurso/perfil não autorizado.");
  const code = opaque();
  const payload = { hash: digest(code), user_id: user.id, ...d };
  if (supabaseEnabled()) {
    const c = await supabaseServer();
    const { error } = await c.rpc("assistant_issue", { d: payload });
    if (error)
      throw new Error(
        error.code === "P0001" ? error.message : "Falha ao autorizar conexão.",
      );
  } else {
    initAssistant();
    const client = one<{ redirect_uris: string }>(
      "SELECT redirect_uris FROM assistant_clients WHERE id=?",
      d.client_id,
    );
    if (!client || !JSON.parse(client.redirect_uris).includes(d.redirect_uri))
      throw new Error("Redirecionamento não registrado.");
    run(
      "INSERT INTO assistant_codes VALUES(?,?,?,?,?,?,?,?)",
      payload.hash,
      user.id,
      d.client_id,
      d.redirect_uri,
      d.code_challenge,
      d.scope,
      d.resource,
      new Date(Date.now() + 300000).toISOString(),
    );
  }
  const url = new URL(d.redirect_uri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", d.state);
  return url.href;
}
export async function exchangeCode(input: unknown, origin: string) {
  const d = z
    .object({
      grant_type: z.literal("authorization_code"),
      client_id: z.string().max(200),
      redirect_uri: z.url(),
      code: z.string().min(40).max(200),
      code_verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
      resource: z.url(),
    })
    .parse(input);
  if (d.resource !== resource(origin)) throw new Error("Recurso inválido.");
  const token = opaque();
  const payload = {
    code_hash: digest(d.code),
    challenge: challenge(d.code_verifier),
    client_id: d.client_id,
    redirect_uri: d.redirect_uri,
    resource: d.resource,
    token_hash: digest(token),
  };
  let scope = "";
  if (supabaseEnabled()) {
    const c = supabaseForUser();
    const { data, error } = await c.rpc("assistant_exchange", { d: payload });
    if (error) throw new Error("Código inválido, expirado ou já utilizado.");
    scope = data.scope;
  } else {
    initAssistant();
    scope = transaction(() => {
      const c = one<{
        user_id: string;
        client_id: string;
        redirect_uri: string;
        challenge: string;
        resource: string;
        scope: string;
        expires_at: string;
      }>("SELECT * FROM assistant_codes WHERE hash=?", payload.code_hash);
      if (
        !c ||
        c.expires_at < new Date().toISOString() ||
        c.client_id !== d.client_id ||
        c.redirect_uri !== d.redirect_uri ||
        c.resource !== d.resource ||
        c.challenge !== payload.challenge
      )
        throw new Error("Código inválido, expirado ou já utilizado.");
      run("DELETE FROM assistant_codes WHERE hash=?", payload.code_hash);
      run(
        "INSERT INTO assistant_tokens(hash,id,user_id,client_id,scope,resource,expires_at) VALUES(?,?,?,?,?,?,?)",
        payload.token_hash,
        randomUUID(),
        c.user_id,
        c.client_id,
        c.scope,
        c.resource,
        new Date(Date.now() + 3600000).toISOString(),
      );
      return c.scope;
    });
  }
  return { access_token: token, token_type: "Bearer", expires_in: 3600, scope };
}
export async function assistantToken(token: string, origin: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new Error("Conexão não autorizada.");
  const hash = digest(token);
  if (supabaseEnabled()) {
    const c = supabaseForUser();
    const { data, error } = await c.rpc("assistant_identity", {
      h: hash,
      r: resource(origin),
    });
    if (error || !data) throw new Error("Conexão expirada ou revogada.");
    return { ...data, hash } as { user: User; scope: string; hash: string };
  }
  initAssistant();
  const t = one<{
    id: string;
    name: string;
    email: string;
    role: User["role"];
    scope: string;
  }>(
    "SELECT p.*,t.scope FROM assistant_tokens t JOIN profiles p ON p.id=t.user_id WHERE t.hash=? AND t.resource=? AND t.expires_at>? AND t.revoked=0",
    hash,
    resource(origin),
    new Date().toISOString(),
  );
  if (!t || !operationalRole(t.role))
    throw new Error("Conexão expirada ou revogada.");
  return {
    user: { id: t.id, name: t.name, email: t.email, role: t.role },
    scope: t.scope,
    hash,
  };
}
export async function connections(user: User, revoke?: string) {
  if (!operationalRole(user.role)) throw new Error("Acesso não autorizado.");
  if (supabaseEnabled()) {
    const c = await supabaseServer();
    const { data, error } = await c.rpc("assistant_connections", {
      revoke: revoke || null,
    });
    if (error) throw new Error("Não foi possível consultar conexões.");
    return data;
  }
  initAssistant();
  if (revoke)
    run(
      "UPDATE assistant_tokens SET revoked=1 WHERE id=? AND user_id=?",
      revoke,
      user.id,
    );
  return all(
    "SELECT t.id,c.name,t.scope,t.expires_at,t.revoked,t.created_at FROM assistant_tokens t JOIN assistant_clients c ON c.id=t.client_id WHERE t.user_id=?",
    user.id,
  );
}
