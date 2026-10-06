import test from "node:test";
import assert from "node:assert/strict";
import {
  extractMapsUrls,
  identifyMapsUrl,
  resolveMapsLink,
  validateMapsUrl,
} from "../lib/maps-links";
test("links: texto compartilhado, URLs exatas e Place ID explícito", () => {
  const u =
    "https://www.google.com/maps/search/?api=1&query=Loja&query_place_id=ChIJ123456789abcdef";
  assert.deepEqual(extractMapsUrls("Loja da praça " + u), [u]);
  assert.equal(identifyMapsUrl(u).place_id, "ChIJ123456789abcdef");
  assert.equal(
    extractMapsUrls(u + " https://maps.app.goo.gl/abcd1234").length,
    2,
  );
  assert.equal(
    identifyMapsUrl(
      "https://www.google.com.br/maps/place/Loja+Central/@-23,-46,15z",
    ).hint,
    "Loja Central",
  );
});
test("links: bloqueia hosts, IPs, credenciais, portas, HTTP e formatos não Google", () => {
  for (const u of [
    "http://maps.app.goo.gl/abcd",
    "https://127.0.0.1/maps",
    "https://169.254.169.254/maps",
    "https://google.com.evil.test/maps",
    "https://user@google.com/maps",
    "https://google.com:444/maps",
    "https://google.com/url?q=http://localhost",
    "https://goo.gl/abcd",
    "https://maps.app.goo.gl/a/b",
  ])
    assert.throws(() => validateMapsUrl(u));
});
test("links: CID não vira Place ID; coordenada, rota, busca e lista não viram empresa", () => {
  assert.equal(
    identifyMapsUrl("https://maps.google.com/?cid=123456").needs_complement,
    true,
  );
  assert.equal(
    identifyMapsUrl(
      "https://www.google.com/maps/place/Loja/data=!1s0x123:0x456",
    ).place_id,
    undefined,
  );
  for (const u of [
    "https://google.com/maps/dir/A/B",
    "https://google.com/maps/search/restaurantes",
    "https://google.com/maps/@-23,-46,15z",
    "https://google.com/maps/d/viewer?id=123",
    "https://maps.google.com/?q=-23,-46",
  ])
    assert.throws(() => identifyMapsUrl(u));
});
test("links: resolução curta limita redirecionamentos e valida cada destino sem requisitá-lo", async () => {
  let calls = 0;
  const mock = (async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://google.com/maps/place/Loja+Central" },
    });
  }) as typeof fetch;
  const p = await resolveMapsLink("https://maps.app.goo.gl/abcd1234", mock);
  assert.equal(p.hint, "Loja Central");
  assert.equal(calls, 1);
  calls = 0;
  const malicious = (async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: "https://169.254.169.254/latest/meta-data" },
    });
  }) as typeof fetch;
  await assert.rejects(
    resolveMapsLink("https://maps.app.goo.gl/abcd1234", malicious),
    /não permitido/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    resolveMapsLink(
      "https://goo.gl/maps/abcd1234",
      (async () => new Response(null, { status: 404 })) as typeof fetch,
    ),
    /não pôde/,
  );
  await assert.rejects(
    resolveMapsLink(
      "https://maps.app.goo.gl/abcd1234",
      (async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://maps.app.goo.gl/abcd1234" },
        })) as typeof fetch,
    ),
    /limite/,
  );
});
