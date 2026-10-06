import { checkOrigin } from "../lib/auth";
import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSale,
  opportunityScore,
  stockRequirements,
  commission,
  ltv,
  money,
} from "../lib/domain";
test("venda com vários itens calcula faturamento, custo, margem e placas", () => {
  const r = calculateSale([
    { quantity: 1, price: 6000, cost: 462, is_plate: true },
    { quantity: 1, price: 6000, cost: 462, is_plate: true },
    { quantity: 2, price: 750, cost: 383, is_plate: true },
  ]);
  assert.equal(r.total, 13500);
  assert.equal(r.cost, 1690);
  assert.equal(r.profit, 11810);
  assert.equal(r.plates, 4);
  assert.equal(r.averagePlate, 3375);
  assert.ok(Math.abs(r.margin - 87.48148) < 0.001);
});
test("margem de preço zero e venda abaixo de custo não produz NaN", () => {
  assert.equal(
    calculateSale([{ quantity: 1, price: 0, cost: 100, is_plate: false }])
      .margin,
    0,
  );
  assert.equal(
    calculateSale([{ quantity: 1, price: 100, cost: 200, is_plate: true }])
      .margin,
    -100,
  );
});
test("score explica os fatores e respeita pesos e limite 100", () => {
  const r = opportunityScore({
    rating: 4.8,
    reviews: 18,
    phone: "19",
    website: "",
    segment: "Restaurante",
    contacted: false,
  });
  assert.equal(r.score, 92);
  assert.equal(
    r.reasons.reduce((s, r) => s + r.points, 0),
    92,
  );
  assert.equal(
    opportunityScore(
      {
        rating: 5,
        reviews: 0,
        phone: "19",
        website: "",
        segment: "Restaurante",
      },
      {
        rating: 100,
        reviews: 100,
        phone: 100,
        website: 100,
        segment: 100,
        contact: 100,
        other: 0,
      },
    ).score,
    100,
  );
});
test("sem dados Google não inventa nota ou quantidade de avaliações", () => {
  const r = opportunityScore({ segment: "Restaurante" });
  assert.equal(r.reasons[0].points, 0);
  assert.equal(r.reasons[1].points, 0);
  assert.equal(r.reasons[3].points, 0);
});
test("composição agrupa materiais compartilhados", () => {
  assert.deepEqual(
    stockRequirements([
      {
        quantity: 3,
        components: [
          { inventory_id: "acrilico", quantity: 1 },
          { inventory_id: "nfc", quantity: 1 },
        ],
      },
      { quantity: 2, components: [{ inventory_id: "acrilico", quantity: 1 }] },
    ]),
    { acrilico: 5, nfc: 3 },
  );
});
test("comissão sobre venda, placa e margem", () => {
  assert.equal(commission(13500, 11810, 4, { type: "percent", value: 5 }), 675);
  assert.equal(
    commission(13500, 11810, 4, { type: "plate", value: 300 }),
    1200,
  );
  assert.equal(
    commission(13500, 11810, 4, { type: "margin", value: 10 }),
    1181,
  );
});
test("LTV ignora vendas canceladas e formatação usa BRL", () => {
  assert.equal(
    ltv([
      { total: 19000 },
      { total: 12000 },
      { total: 8000 },
      { total: 1000, cancelled: true },
    ]),
    39000,
  );
  assert.match(money(13500), /135,00/);
});

test("proteção de origem rejeita outro domínio, outra porta e origem ausente", () => {
  assert.equal(
    checkOrigin(
      new Request("http://0.0.0.0:3000/api/data", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
      }),
    ),
    true,
  );
  assert.equal(
    checkOrigin(
      new Request("http://0.0.0.0:3000/api/data", {
        headers: { host: "127.0.0.1:3000", origin: "https://evil.example" },
      }),
    ),
    false,
  );
  assert.equal(
    checkOrigin(
      new Request("http://0.0.0.0:3000/api/data", {
        headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:4000" },
      }),
    ),
    false,
  );
  assert.equal(
    checkOrigin(new Request("http://127.0.0.1:3000/api/data")),
    false,
  );
});
