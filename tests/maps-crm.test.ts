import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, insert, one, all } from "../lib/db";
import { hashPassword, type User } from "../lib/auth";
import { prepareMapsImport, getMapsPreview } from "../lib/maps-import";
import { saveMapsCompany } from "../lib/maps-crm";
test("Google simulado: candidatos, prévia por usuário, dados transitórios, reimportação e campos próprios preservados", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "axl-maps-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  process.env.AXL_BACKEND = "local";
  const original = globalThis.fetch,
    key = process.env.GOOGLE_PLACES_API_KEY;
  try {
    const user: User = {
      id: insert("profiles", {
        name: "Alex",
        email: "maps-test@example.com",
        role: "ADMIN",
        password_hash: hashPassword("TesteSomenteLocal!2026"),
      }),
      name: "Alex",
      email: "maps-test@example.com",
      role: "ADMIN",
    };
    delete process.env.GOOGLE_PLACES_API_KEY;
    const url = "https://google.com/maps/place/Loja+Central";
    assert.equal(
      (await prepareMapsImport({ text: url }, user.id)).state,
      "configuration_pending",
    );
    process.env.GOOGLE_PLACES_API_KEY = "fixture-only-not-a-real-key";
    let queries = 0;
    globalThis.fetch = (async (input, init) => {
      assert.equal(
        String(input),
        "https://places.googleapis.com/v1/places:searchText",
      );
      assert.match(
        String((init!.headers as Record<string, string>)["X-Goog-FieldMask"]),
        /places.id/,
      );
      const request = JSON.parse(String(init!.body));
      assert.equal(request.pageSize, 5);
      assert.equal(request.minRating, undefined);
      queries++;
      return Response.json({
        places: [
          {
            id: "ChIJ123456789abcdef",
            displayName: { text: "Nome fornecido Google" },
            formattedAddress: "Endereço Google",
            rating: 4.8,
            userRatingCount: 19,
          },
          {
            id: "ChIJ987654321abcdef",
            displayName: { text: "Outra filial" },
            formattedAddress: "Outro endereço",
          },
        ],
      });
    }) as typeof fetch;
    const response = await prepareMapsImport(
      { text: "Loja " + url, city: "Valinhos" },
      user.id,
    );
    assert.equal(response.state, "preview");
    assert.equal(response.candidates?.length, 2);
    assert.equal(queries, 1);
    const candidate = response.candidates![0];
    assert.throws(() => getMapsPreview(candidate.token, "outro"), /expirada/);
    const saved = (await saveMapsCompany(
      {
        url,
        token: candidate.token,
        fields: {
          name: "Nome próprio confirmado",
          city: "Valinhos",
          phone: "11999999999",
          notes: "Dado próprio",
        },
      },
      user,
    )) as { id: string };
    const company = one<{
      name: string;
      phone: string;
      notes: string;
      place_id: string;
      address: string;
    }>("SELECT * FROM companies WHERE id=?", saved.id)!;
    assert.equal(company.name, "Nome próprio confirmado");
    assert.equal(company.address, "");
    assert.equal(company.place_id, candidate.place.id);
    const dup = (await saveMapsCompany(
      {
        url,
        token: candidate.token,
        fields: {
          name: "Outra alteração indevida",
          city: "Campinas",
          phone: "9999",
        },
      },
      user,
    )) as { id: string };
    assert.equal(dup.id, saved.id);
    assert.equal(all("SELECT * FROM companies").length, 1);
    assert.equal(
      one<{ phone: string }>("SELECT phone FROM companies WHERE id=?", saved.id)
        ?.phone,
      "11999999999",
    );
    assert.equal(all("SELECT * FROM sales").length, 0);
    assert.equal(all("SELECT * FROM activities").length, 1);
    assert.equal(
      (all("SELECT * FROM company_map_links")[0] as Record<string, unknown>)
        .rating,
      undefined,
    );
  } finally {
    globalThis.fetch = original;
    if (key === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = key;
    db().close();
    delete (globalThis as { axlDb?: unknown }).axlDb;
    rmSync(dir, { recursive: true, force: true });
  }
});
