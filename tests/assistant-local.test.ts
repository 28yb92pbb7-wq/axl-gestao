import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { db, insert, one, all } from "../lib/db";
import { hashPassword, type User } from "../lib/auth";
import { initializeLocalOperations } from "../lib/operations-local";
import {
  registerClient,
  issueCode,
  exchangeCode,
  challenge,
  assistantToken,
  connections,
} from "../lib/assistant-oauth";
import { assistantCall } from "../lib/assistant-service";
test("assistente: OAuth PKCE, escopo, recurso, venda única, homônimo, pagamento desconhecido e revogação", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "axl-assistant-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  process.env.AXL_BACKEND = "local";
  try {
    const user: User = {
      id: insert("profiles", {
        name: "Laura",
        email: "assistant-test@example.com",
        role: "VENDEDOR",
        password_hash: hashPassword("TesteSomenteLocal!2026"),
      }),
      name: "Laura",
      email: "assistant-test@example.com",
      role: "VENDEDOR",
    };
    initializeLocalOperations();
    const client = await registerClient({
      redirect_uris: ["https://client.example.test/callback"],
    });
    const verifier = "a".repeat(50);
    const origin = "https://axl.example.test";
    const authorize = {
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      response_type: "code",
      code_challenge: challenge(verifier),
      code_challenge_method: "S256",
      scope: "axl:read axl:write",
      resource: origin + "/api/mcp",
      state: "test-state",
    };
    await assert.rejects(
      issueCode(
        { ...authorize, redirect_uri: "https://evil.test/callback" },
        user,
        origin,
      ),
      /não registrado/,
    );
    await assert.rejects(
      issueCode(
        { ...authorize, resource: "https://other.test/api/mcp" },
        user,
        origin,
      ),
      /não autorizado/,
    );
    const redirect = new URL(await issueCode(authorize, user, origin));
    assert.equal(redirect.searchParams.get("state"), "test-state");
    const exchange = {
      grant_type: "authorization_code",
      client_id: client.client_id,
      redirect_uri: client.redirect_uris[0],
      code: redirect.searchParams.get("code"),
      code_verifier: verifier,
      resource: authorize.resource,
    };
    await assert.rejects(
      exchangeCode({ ...exchange, code_verifier: "b".repeat(50) }, origin),
      /Código inválido/,
    );
    const issued = await exchangeCode(exchange, origin);
    await assert.rejects(exchangeCode(exchange, origin), /Código inválido/);
    await assert.rejects(
      assistantToken(issued.access_token, "https://other.test"),
      /revogada/,
    );
    const p = one<{ id: string }>(
      "SELECT id FROM products WHERE sku=?",
      "AXL-GOOGLE",
    )!;
    const sale = {
      request_id: randomUUID(),
      name: "Venda assistente",
      date: "2026-10-06",
      total: 15000,
      items: [{ product_id: p.id, quantity: 3 }],
    };
    const result = (await assistantCall(
      "registrar_venda",
      sale,
      issued.access_token,
      origin,
    )) as { id: string };
    assert.equal(
      (
        (await assistantCall(
          "registrar_venda",
          sale,
          issued.access_token,
          origin,
        )) as { id: string }
      ).id,
      result.id,
    );
    assert.equal(all("SELECT * FROM sales").length, 1);
    assert.equal(all("SELECT * FROM payments").length, 0);
    assert.equal(
      one<{ payment_known: number }>(
        "SELECT payment_known FROM sales WHERE id=?",
        result.id,
      )?.payment_known,
      0,
    );
    assert.equal(
      (
        (await assistantCall(
          "consultar_operacao",
          { request_id: sale.request_id },
          issued.access_token,
          origin,
        )) as { id: string }
      ).id,
      result.id,
    );
    await assert.rejects(
      assistantCall(
        "registrar_venda",
        { ...sale, total: 14000 },
        issued.access_token,
        origin,
      ),
      /dados diferentes/,
    );
    await assert.rejects(
      assistantCall(
        "registrar_venda",
        { ...sale, request_id: randomUUID() },
        issued.access_token,
        origin,
      ),
      /homônimo/,
    );
    await assert.rejects(
      assistantCall(
        "consultar_resumo",
        { organization_id: "other" },
        issued.access_token,
        origin,
      ),
    );
    const rows = (await connections(user)) as { id: string; hash?: string }[];
    assert.ok(rows[0].id);
    assert.equal(rows[0].hash, undefined);
    await connections(user, rows[0].id);
    await assert.rejects(
      assistantToken(issued.access_token, origin),
      /revogada/,
    );
    const readRedirect = new URL(
      await issueCode({ ...authorize, scope: "axl:read" }, user, origin),
    );
    const read = await exchangeCode(
      { ...exchange, code: readRedirect.searchParams.get("code") },
      origin,
    );
    await assistantCall("consultar_resumo", {}, read.access_token, origin);
    await assert.rejects(
      assistantCall(
        "registrar_venda",
        { ...sale, request_id: randomUUID() },
        read.access_token,
        origin,
      ),
      /somente para leitura/,
    );
  } finally {
    db().close();
    delete (globalThis as { axlDb?: unknown }).axlDb;
    rmSync(dir, { recursive: true, force: true });
  }
});
