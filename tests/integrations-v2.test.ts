import test from "node:test";
import assert from "node:assert/strict";
import { whatsappNumber, whatsappLink } from "../lib/contact";
import { directionsLink } from "../lib/routes";
import { googleFailure, municipality, distanceKm } from "../lib/google-places";
test("WhatsApp não duplica DDI e mantém texto editado", () => {
  assert.equal(whatsappNumber("+55 (19) 99999-9999"), "5519999999999");
  assert.equal(whatsappNumber("(19) 99999-9999"), "5519999999999");
  assert.throws(() => whatsappNumber("123"));
  assert.equal(
    new URL(whatsappLink("+55 19 99999-9999", "Olá & AXL")).searchParams.get(
      "text",
    ),
    "Olá & AXL",
  );
});
test("Google diagnostica causas sem expor mensagens privadas", () => {
  for (const [reason, code] of [
    ["API_KEY_INVALID", "invalid_key"],
    ["SERVICE_DISABLED", "api_disabled"],
    ["BILLING_DISABLED", "billing"],
    ["API_KEY_IP_ADDRESS_BLOCKED", "restriction"],
  ])
    assert.equal(
      googleFailure(403, { error: { details: [{ reason }] } }).code,
      code,
    );
  assert.equal(googleFailure(429, {}).code, "quota");
  assert.equal(
    municipality(
      {
        id: "1",
        displayName: { text: "X" },
        addressComponents: [
          { longText: "Valinhos", types: ["administrative_area_level_2"] },
        ],
      },
      "VALINHOS",
    ),
    "matched",
  );
  assert.equal(
    municipality({ id: "1", displayName: { text: "X" } }, "Valinhos"),
    "unknown",
  );
  assert.equal(
    distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0 }),
    0,
  );
});
test("rota ordenada usa endereço fallback e rejeita paradas sem referência", () => {
  const u = new URL(
    directionsLink(
      [
        { id: "a", name: "A", address: "Rua A" },
        { id: "b", name: "B", address: "Rua B" },
      ],
      "Minha partida",
    ),
  );
  assert.equal(u.searchParams.get("destination"), "Rua B");
  assert.equal(u.searchParams.get("waypoints"), "Rua A");
  assert.throws(
    () => directionsLink([{ id: "x", name: "Sem endereço" }], ""),
    /endereço/,
  );
  assert.throws(
    () =>
      directionsLink(
        Array.from({ length: 6 }, (_, i) => ({
          id: String(i),
          name: "X",
          address: "Rua",
        })),
        "",
      ),
    /4 paradas/,
  );
});
