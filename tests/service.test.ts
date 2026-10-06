import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { insert, one, run, all, db } from "../lib/db";
import { mutate, readState } from "../lib/service";
import { hashPassword, verifyPassword } from "../lib/auth";
import { today } from "../lib/domain";
import type { User } from "../lib/auth";
const dir = mkdtempSync(path.join(tmpdir(), "axl-test-"));
process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
const uid = insert("profiles", {
  name: "Teste",
  email: "test@example.com",
  password_hash: hashPassword("password-test"),
  role: "ADMIN",
});
const user: User = {
  id: uid,
  name: "Teste",
  email: "test@example.com",
  role: "ADMIN",
};
const company = mutate(
  "company",
  { name: "Empresa teste", city: "Valinhos" },
  user,
) as string;
const inventory = insert("inventory_items", {
  name: "Tag",
  quantity: 10,
  cost: 79,
  minimum: 2,
});
const product = mutate(
  "product",
  {
    name: "Placa",
    sku: "PLACA",
    category: "Placas NFC",
    controls_stock: true,
    price: 6000,
    cost: 462,
  },
  user,
) as string;
insert("product_components", {
  product_id: product,
  inventory_id: inventory,
  quantity: 1,
});
const base = {
  company_id: company,
  date: today(),
  method: "Pix",
  paid: 0,
  due_date: today(),
  items: [{ product_id: product, quantity: 3, price: 6000 }],
};
let sale: string;
test("autenticação usa hash salgado e comparação verificada", () => {
  const a = hashPassword("test-pass");
  const b = hashPassword("test-pass");
  assert.notEqual(a, b);
  assert.equal(verifyPassword("test-pass", a), true);
  assert.equal(verifyPassword("wrong", a), false);
});
test("venda cria pedido e preserva custo e comissão", () => {
  sale = mutate("sale", base, user) as string;
  assert.equal(
    one<{ total: number; cost: number }>(
      "SELECT total,cost FROM sales WHERE id=?",
      sale,
    )?.total,
    18000,
  );
  assert.equal(
    one<{ cost: number }>("SELECT cost FROM sales WHERE id=?", sale)?.cost,
    237,
  );
  run("UPDATE inventory_items SET cost=200 WHERE id=?", inventory);
  run("UPDATE products SET price=10000 WHERE id=?", product);
  assert.equal(
    one<{ cost: number }>("SELECT cost FROM sale_items WHERE sale_id=?", sale)
      ?.cost,
    79,
  );
  assert.equal(readState().orders.length, 1);
  assert.equal(readState().companies[0].is_customer, 1);
  assert.equal(readState().companies[0].is_lead, 1);
});
test("pagamento parcial bloqueia excedente e não deixa registros parciais", () => {
  mutate(
    "payment",
    { sale_id: sale, amount: 5000, method: "Pix", date: today() },
    user,
  );
  assert.throws(
    () =>
      mutate(
        "payment",
        { sale_id: sale, amount: 14000, method: "Pix", date: today() },
        user,
      ),
    /supera/,
  );
  assert.equal(readState().sales[0].paid, 5000);
  assert.equal(all("SELECT * FROM payments").length, 1);
});
test("produção exige aprovação, baixa composição uma vez e registra histórico", () => {
  const order = readState().orders[0];
  assert.throws(() => mutate("produce", { id: order.id }, user), /Aprove/);
  mutate("order", { id: order.id, status: "Arte aprovada" }, user);
  mutate("produce", { id: order.id }, user);
  assert.equal(readState().inventory[0].quantity, 7);
  assert.equal(readState().movements.length, 1);
  assert.throws(
    () => mutate("produce", { id: order.id }, user),
    /já produzido/,
  );
  assert.equal(readState().inventory[0].quantity, 7);
});
test("estoque insuficiente reverte toda a produção", () => {
  const s = mutate(
    "sale",
    { ...base, items: [{ product_id: product, quantity: 8, price: 6000 }] },
    user,
  ) as string;
  const o = one<{ id: string }>("SELECT id FROM orders WHERE sale_id=?", s)!;
  mutate("order", { id: o.id, status: "Arte aprovada" }, user);
  assert.throws(() => mutate("produce", { id: o.id }, user), /insuficiente/);
  assert.equal(readState().inventory[0].quantity, 7);
  assert.equal(
    one<{ produced_at: string | null }>(
      "SELECT produced_at FROM orders WHERE id=?",
      o.id,
    )?.produced_at,
    null,
  );
});
test("venda inválida não cria venda, pedido ou pagamento", () => {
  const count = all("SELECT * FROM sales").length;
  assert.throws(() => mutate("sale", { ...base, paid: 20000 }, user), /maior/);
  assert.equal(all("SELECT * FROM sales").length, count);
});
test("compra atualiza custo ponderado e cria entrada e despesa", () => {
  mutate(
    "purchase",
    {
      inventory_id: inventory,
      supplier: "Fornecedor",
      quantity: 3,
      total: 300,
      date: today(),
      paid: true,
    },
    user,
  );
  assert.equal(readState().inventory[0].quantity, 10);
  assert.equal(readState().inventory[0].cost, 170);
  assert.equal(readState().expenses[0].amount, 300);
});
test("alterar cadastro não apaga atividades", () => {
  const count = readState().activities.length;
  mutate(
    "company",
    { id: company, name: "Empresa editada", city: "Vinhedo" },
    user,
  );
  assert.equal(readState().activities.length, count + 1);
});
test("usuários sem perfil administrador não podem operar", () => {
  assert.throws(
    () =>
      mutate(
        "product",
        { name: "Produto", sku: "X", price: 0, cost: 0, category: "Outros" },
        { ...user, role: "VENDEDOR" },
      ),
    /administrador/,
  );
});
test("alteração de composição não modifica materiais preservados na venda", () => {
  const sale = mutate(
    "sale",
    { ...base, items: [{ product_id: product, quantity: 1, price: 6000 }] },
    user,
  ) as string;
  mutate(
    "components",
    {
      product_id: product,
      components: [{ inventory_id: inventory, quantity: 5 }],
    },
    user,
  );
  const order = one<{ id: string }>(
    "SELECT id FROM orders WHERE sale_id=?",
    sale,
  )!;
  mutate("order", { id: order.id, status: "Arte aprovada" }, user);
  const before = readState().inventory[0].quantity;
  mutate("produce", { id: order.id }, user);
  assert.equal(readState().inventory[0].quantity, before - 1);
});
test("composição com material duplicado não apaga a composição anterior", () => {
  assert.throws(
    () =>
      mutate(
        "components",
        {
          product_id: product,
          components: [
            { inventory_id: inventory, quantity: 1 },
            { inventory_id: inventory, quantity: 2 },
          ],
        },
        user,
      ),
    /repita/,
  );
  assert.equal(readState().components[0].quantity, 5);
});
test("usuários são criados com senha validada e o estado público não expõe hashes", () => {
  assert.throws(() =>
    mutate(
      "user",
      {
        name: "Admin novo",
        email: "new@example.com",
        password: "curta",
        role: "ADMIN",
      },
      user,
    ),
  );
  mutate(
    "user",
    {
      name: "Admin novo",
      email: "new@example.com",
      password: "test-password-only",
      role: "ADMIN",
    },
    user,
  );
  assert.equal(readState().profiles.length, 2);
  assert.equal(
    JSON.stringify(readState().profiles).includes("password_hash"),
    false,
  );
});
test.after(() => {
  db().close();
  rmSync(dir, { recursive: true, force: true });
});
