import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
async function main() {
  const base = process.env.AXL_SMOKE_URL || "http://127.0.0.1:3000";
  const credentials = readFileSync(".data/acesso-inicial.txt", "utf8");
  const email =
    process.env.AXL_SMOKE_EMAIL || credentials.match(/E-mail: (.+)/)?.[1];
  const password =
    process.env.AXL_SMOKE_PASSWORD || credentials.match(/Senha: (.+)/)?.[1];
  assert.ok(email && password, "Configure o usuário de teste local.");
  const unauth = await fetch(base + "/api/data");
  assert.equal(unauth.status, 401);
  const login = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200, "Login local falhou.");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  const data = await fetch(base + "/api/data", { headers: { Cookie: cookie } });
  assert.equal(data.status, 200);
  const state = await data.json();
  assert.ok(Array.isArray(state.products) && state.products.length > 0);
  assert.ok(!JSON.stringify(state.profiles).includes("password_hash"));
  const home = await fetch(base + "/", { headers: { Cookie: cookie } });
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Olá, equipe AXL/);
  const logout = await fetch(base + "/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: base,
      Cookie: cookie,
    },
    body: JSON.stringify({ action: "logout" }),
  });
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(base + "/api/data", { headers: { Cookie: cookie } })).status,
    401,
  );
  console.log("Login, proteção de acesso, dashboard, banco e logout: OK.");
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Verificação falhou.");
  process.exitCode = 1;
});
