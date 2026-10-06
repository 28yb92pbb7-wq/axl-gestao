import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { insert, one, all, db } from "../lib/db";
import { hashPassword } from "../lib/auth";
import {
  initializeLocalOperations,
  mutateLocalOperation,
} from "../lib/operations-local";
import { financeSummary } from "../lib/finance";
import { readState } from "../lib/service";
import { readLocalOperations } from "../lib/operations-local";
import type { State } from "../lib/types";
test("local: novo cliente sem cadastro, Laura, parcial, contagem, reserva, lote e caixa", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "axl-ops-"));
  process.env.DATABASE_PATH = path.join(dir, "test.sqlite");
  try {
    const uid = insert("profiles", {
      name: "Laura",
      email: "laura@example.com",
      role: "VENDEDOR",
      password_hash: hashPassword("TesteColaborador!2026"),
    });
    const user = {
      id: uid,
      name: "Laura",
      email: "laura@example.com",
      role: "VENDEDOR" as const,
    };
    initializeLocalOperations();
    const p = one<{ id: string }>(
      "SELECT id FROM products WHERE sku='AXL-GOOGLE'",
    )!;
    const data = {
      request_id: randomUUID(),
      name: "Novo sem cadastro",
      date: "2026-10-06",
      total: 6000,
      payment_status: "unknown",
      items: [{ product_id: p.id, quantity: 1 }],
    };
    const r = mutateLocalOperation("quick_sale", data, user) as {
      id: string;
      company_id: string;
      order_id: string;
    };
    assert.equal(
      (mutateLocalOperation("quick_sale", data, user) as { id: string }).id,
      r.id,
    );
    assert.equal(all("SELECT * FROM sales").length, 1);
    assert.equal(one<{ cost: number }>("SELECT cost FROM sales")!.cost, 502);
    assert.equal(all("SELECT * FROM payments").length, 0);
    assert.throws(
      () => mutateLocalOperation("reserve", { id: r.order_id }, user),
      /conferir/,
    );
    for (const i of all<{ id: string }>("SELECT id FROM inventory_items"))
      mutateLocalOperation(
        "stock_count",
        {
          id: i.id,
          quantity: 10,
          date: "2026-10-06",
          notes: "Contagem de Laura",
        },
        user,
      );
    mutateLocalOperation("reserve", { id: r.order_id }, user);
    assert.equal(
      one<{ quantity: number }>("SELECT quantity FROM inventory_items")!
        .quantity,
      10,
    );
    mutateLocalOperation(
      "order_update",
      { id: r.order_id, status: "Arte aprovada" },
      user,
    );
    mutateLocalOperation("produce", { id: r.order_id }, user);
    assert.throws(
      () => mutateLocalOperation("produce", { id: r.order_id }, user),
      /uma vez/,
    );
    mutateLocalOperation(
      "payment_set",
      { id: r.id, status: "partial", amount: 3000, date: "2026-10-06" },
      user,
    );
    const material = one<{ id: string }>("SELECT id FROM inventory_items")!.id;
    mutateLocalOperation(
      "lot_purchase",
      {
        inventory_id: material,
        code: "NOVO",
        quantity: 10,
        amount: 1000,
        received: 2,
        date: "2026-10-06",
        paid: 500,
      },
      user,
    );
    let state = { ...readState(), ...readLocalOperations() } as State;
    assert.equal(financeSummary(state).cash, null);
    assert.equal(financeSummary(state).unknown, 0);
    mutateLocalOperation(
      "cash_entry",
      {
        type: "opening",
        amount: 10000,
        date: "2026-10-06",
        notes: "Conferido",
      },
      user,
    );
    state = { ...readState(), ...readLocalOperations() } as State;
    assert.equal(financeSummary(state).cash, 12500);
    assert.equal(
      all("SELECT * FROM inventory_lots WHERE source_key IS NOT NULL").length,
      6,
    );
    const direct = mutateLocalOperation(
      "direct_order",
      { company_id: r.company_id, product_id: p.id, quantity: 1 },
      user,
    ) as { id: string };
    assert.equal(all("SELECT * FROM sales").length, 1);
    assert.ok(direct.id);
  } finally {
    db().close();
    rmSync(dir, { recursive: true, force: true });
  }
});
