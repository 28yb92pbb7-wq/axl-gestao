import { db, one, all, run, insert, transaction, activity, audit } from "./db";
import type { User } from "./auth";
import {
  operationSchemas,
  type OperationAction,
  operationalRole,
} from "./operations-schema";
export function initializeLocalOperations() {
  const columns: Record<string, Record<string, string>> = {
    sales: {
      request_id: "TEXT",
      seller_lat: "REAL",
      seller_lng: "REAL",
      user_id: "TEXT",
      cost_status: "TEXT DEFAULT 'confirmed'",
      payment_known: "INTEGER DEFAULT 1",
      cost_known: "INTEGER DEFAULT 1",
      revenue_allocated: "INTEGER DEFAULT 1",
      discount: "INTEGER DEFAULT 0",
    },
    inventory_items: {
      quantity_known: "INTEGER DEFAULT 1",
      cost_status: "TEXT DEFAULT 'confirmed'",
      cost_origin: "TEXT",
      kind: "TEXT DEFAULT 'material'",
      stock_confirmed_at: "TEXT",
    },
    products: { kind: "TEXT DEFAULT 'physical'", stock_inventory_id: "TEXT" },
    sale_items: {
      unit_cost_precise: "REAL",
      cost_total: "INTEGER",
      cost_status: "TEXT DEFAULT 'confirmed'",
      cost_origin: "TEXT",
      line_total: "INTEGER",
      revenue_known: "INTEGER DEFAULT 1",
    },
    inventory_movements: { user_id: "TEXT" },
    orders: {
      company_id: "TEXT",
      item_snapshot: "TEXT DEFAULT '[]'",
      responsible_id: "TEXT",
      cancelled_reason: "TEXT",
    },
  };
  for (const [table, defs] of Object.entries(columns)) {
    const known = all<{ name: string }>(`PRAGMA table_info(${table})`);
    for (const [column, type] of Object.entries(defs))
      if (!known.some((c) => c.name === column))
        db().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  const ordersInfo = all<{ name: string; notnull: number }>(
    "PRAGMA table_info(orders)",
  );
  if (ordersInfo.find((c) => c.name === "sale_id")?.notnull) {
    db().exec(
      `PRAGMA foreign_keys=OFF;BEGIN;CREATE TABLE orders_v2(id TEXT PRIMARY KEY,sale_id TEXT UNIQUE REFERENCES sales(id),company_id TEXT REFERENCES companies(id),status TEXT DEFAULT 'Pedido recebido',promised_date TEXT,notes TEXT DEFAULT '',produced_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,item_snapshot TEXT DEFAULT '[]',responsible_id TEXT,cancelled_reason TEXT);INSERT INTO orders_v2 SELECT id,sale_id,company_id,status,promised_date,notes,produced_at,created_at,updated_at,item_snapshot,responsible_id,cancelled_reason FROM orders;DROP TABLE orders;ALTER TABLE orders_v2 RENAME TO orders;COMMIT;PRAGMA foreign_keys=ON;`,
    );
  }
  db().exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS sales_request_id ON sales(request_id);CREATE TABLE IF NOT EXISTS contact_events(id TEXT PRIMARY KEY,company_id TEXT,user_id TEXT,type TEXT,phone TEXT,text TEXT,result TEXT,next_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS cash_entries(id TEXT PRIMARY KEY,type TEXT,amount INTEGER,date TEXT,notes TEXT,user_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS lot_payments(id TEXT PRIMARY KEY,lot_id TEXT,amount INTEGER,date TEXT,user_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS inventory_counts(id TEXT PRIMARY KEY,inventory_id TEXT,previous_quantity REAL,quantity REAL,date TEXT,initial INTEGER,notes TEXT,user_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS inventory_lots(id TEXT PRIMARY KEY,inventory_id TEXT,code TEXT,quantity REAL,amount INTEGER,freight INTEGER DEFAULT 0,unit_cost REAL,received REAL DEFAULT 0,purchase_date TEXT,supplier TEXT,paid INTEGER DEFAULT 0,paid_known INTEGER DEFAULT 0,financial_date TEXT,receipt_status TEXT,source_key TEXT UNIQUE,notes TEXT,user_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS inventory_reservations(id TEXT PRIMARY KEY,order_id TEXT,inventory_id TEXT,quantity REAL,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS order_events(id TEXT PRIMARY KEY,order_id TEXT,user_id TEXT,type TEXT,notes TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);CREATE TABLE IF NOT EXISTS proposals(id TEXT PRIMARY KEY,company_id TEXT,user_id TEXT,text TEXT,amount INTEGER,status TEXT DEFAULT 'Rascunho',created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
  );
  run(
    "UPDATE products SET kind='service' WHERE controls_stock=0 AND category IN('Serviços digitais','Consultoria','Serviços')",
  );
  db().exec(
    `CREATE TRIGGER IF NOT EXISTS contact_stage_insert BEFORE INSERT ON companies WHEN NEW.status='Contato realizado' AND NOT EXISTS(SELECT 1 FROM contact_events WHERE company_id=NEW.id AND type IN('Mensagem enviada','Ligação','Visita')) BEGIN SELECT RAISE(ABORT,'Confirme contato efetivo antes de mudar etapa.');END;CREATE TRIGGER IF NOT EXISTS contact_stage_update BEFORE UPDATE OF status ON companies WHEN NEW.status='Contato realizado' AND OLD.status<>NEW.status AND NOT EXISTS(SELECT 1 FROM contact_events WHERE company_id=NEW.id AND type IN('Mensagem enviada','Ligação','Visita')) BEGIN SELECT RAISE(ABORT,'Confirme contato efetivo antes de mudar etapa.');END;`,
  );
  if (
    !one("SELECT key FROM settings WHERE key='v2_catalog'") ||
    !one("SELECT id FROM products WHERE sku='AXL-PIX-QR'")
  )
    transaction(() => {
      const materials = [
        ["Base/acrílico — referência atual", 340, "confirmed"],
        ["Adesivo impresso — referência atual", 83, "confirmed"],
        ["Etiqueta NFC — referência provisória", 79, "estimated"],
      ];
      const ids = materials.map(
        ([name, cost, status]) =>
          one<{ id: string }>(
            "SELECT id FROM inventory_items WHERE name=?",
            name,
          )?.id ||
          insert("inventory_items", {
            name,
            cost,
            unit: "un",
            quantity: 0,
            minimum: 0,
            quantity_known: 0,
            cost_status: status,
            cost_origin:
              "Referência de Alex em 06/10/2026; NFC provisório; base interpretada sem adesivo/NFC",
          }),
      );
      const products = [
        ["GOOGLE", "Placa Google NFC/QR", 6000, 1, 1],
        ["WHATSAPP", "Placa WhatsApp NFC/QR", 6000, 1, 1],
        ["INSTAGRAM", "Placa Instagram NFC/QR", 6000, 1, 1],
        ["PIX-QR", "Placa Pix somente QR", 1500, 1, 0],
        ["MESA", "Adesivo NFC de mesa", 0, 0, 1],
        ["DIGITAL", "Serviço digital", 0, 0, 0],
      ];
      for (const [sku, name, price, base, nfc] of products) {
        let p = one<{ id: string }>(
          "SELECT id FROM products WHERE sku=?",
          "AXL-" + sku,
        )?.id;
        if (!p)
          p = insert("products", {
            sku: "AXL-" + sku,
            name,
            price,
            cost:
              Number(base) * 340 +
              (sku === "DIGITAL" ? 0 : 83) +
              Number(nfc) * 79,
            category: sku === "DIGITAL" ? "Serviços" : "Soluções",
            kind: sku === "DIGITAL" ? "service" : "physical",
            is_plate: base,
            uses_acrylic: base,
            uses_nfc: nfc,
            controls_stock: Number(sku !== "DIGITAL"),
          });
        if (sku !== "DIGITAL") {
          for (const k of [1, ...(base ? [0] : []), ...(nfc ? [2] : [])])
            if (
              !one(
                "SELECT id FROM product_components WHERE product_id=? AND inventory_id=?",
                p,
                ids[k],
              )
            )
              insert("product_components", {
                product_id: p,
                inventory_id: ids[k],
                quantity: 1,
              });
        }
      }
      const lots = [
        ["ACR-01", 0, 12, 3600, 12],
        ["ACR-02", 0, 200, 64000, 200],
        ["NFC-01", 2, 150, 10800, 150],
        ["NFC-02", 2, 150, 10800, 150],
        ["NFC-03", 2, 400, 11500, 0],
        ["IMP-01", 1, 60, 5000, 60],
      ];
      for (const [code, m, q, a, r] of lots)
        if (
          !one(
            "SELECT id FROM inventory_lots WHERE source_key=?",
            "controle-nfc:" + code,
          )
        )
          insert("inventory_lots", {
            inventory_id: ids[Number(m)],
            code,
            quantity: q,
            amount: a,
            unit_cost: Number(a) / Number(q),
            received: r,
            source_key: "controle-nfc:" + code,
            receipt_status: "historical_review",
            notes:
              "Histórico de 20/09/2026 para revisão. Sem movimento de estoque ou caixa; NFC-03 aproximado.",
          });
      run(
        "INSERT OR IGNORE INTO settings(key,value) VALUES('v2_catalog','true')",
      );
    });
}
export function readLocalOperations() {
  initializeLocalOperations();
  return {
    orders: all(
      "SELECT o.*,s.number,c.name company_name FROM orders o LEFT JOIN sales s ON s.id=o.sale_id JOIN companies c ON c.id=COALESCE(o.company_id,s.company_id)",
    ),
    v2: true,
    lotPayments: all("SELECT * FROM lot_payments"),
    lots: all("SELECT * FROM inventory_lots"),
    cash: all("SELECT * FROM cash_entries"),
    contacts: all(
      "SELECT c.*,p.name user_name FROM contact_events c JOIN profiles p ON p.id=c.user_id",
    ),
    reservations: all("SELECT * FROM inventory_reservations"),
    counts: all("SELECT * FROM inventory_counts"),
    orderEvents: all(
      "SELECT e.*,p.name user_name FROM order_events e JOIN profiles p ON p.id=e.user_id",
    ),
    proposals: all("SELECT * FROM proposals"),
  };
}
export function mutateLocalOperation(
  action: OperationAction,
  input: unknown,
  user: User,
) {
  if (!operationalRole(user.role)) throw new Error("Acesso não autorizado.");
  initializeLocalOperations();
  const parsed = operationSchemas[action].parse(input);
  return transaction(() => {
    if (action === "quick_sale") {
      const d = operationSchemas.quick_sale.parse(parsed);
      const prior = one<{ id: string; company_id: string }>(
        "SELECT id,company_id FROM sales WHERE request_id=?",
        d.request_id,
      );
      if (prior) return prior;
      let cid = d.company_id;
      if (cid && !one("SELECT id FROM companies WHERE id=?", cid))
        throw new Error("Estabelecimento não encontrado.");
      if (!cid) {
        if (d.place_id)
          cid =
            one<{ id: string }>(
              "SELECT id FROM companies WHERE place_id=?",
              d.place_id,
            )?.id || null;
        if (!cid) {
          if (
            one(
              "SELECT id FROM companies WHERE lower(trim(name))=lower(trim(?))",
              d.name,
            ) &&
            !d.new_homonym
          )
            throw new Error(
              "Selecione a ficha correta ou confirme novo estabelecimento homônimo.",
            );
          cid = insert("companies", {
            name: d.name,
            city: d.city,
            contact: d.contact,
            phone: d.phone,
            is_customer: 1,
            is_lead: 0,
            status: "Venda",
            origin: "Venda rápida",
            place_id: d.place_id,
          });
        }
      }
      const paid = d.payment_status === "received" ? d.total : d.paid || 0;
      if (["unknown", "pending"].includes(d.payment_status) && paid)
        throw new Error("Confirme pagamento parcial ou recebido.");
      if (d.payment_status === "partial" && (!paid || paid >= d.total))
        throw new Error("Recebimento parcial deve ficar entre zero e o total.");
      const allocated = d.items.every((i) => i.line_total !== null);
      if (
        allocated &&
        d.items.reduce((s, i) => s + (i.line_total || 0), 0) !== d.total
      )
        throw new Error("Valores dos itens não conciliam com total.");
      const sid = insert("sales", {
        number: one<{ n: number }>(
          "SELECT COALESCE(max(number),0)+1 n FROM sales",
        )!.n,
        company_id: cid,
        date: d.date,
        total: d.total,
        cost: 0,
        profit: 0,
        plates: 0,
        method: d.method,
        due_date: d.due_date || d.date,
        notes: d.notes,
        commission: 0,
        commission_rule: "{}",
        payment_known: Number(d.payment_status !== "unknown"),
        user_id: user.id,
        request_id: d.request_id,
        seller_lat: d.seller_lat,
        seller_lng: d.seller_lng,
        revenue_allocated: Number(allocated),
        discount: d.discount,
      });
      let cost = 0,
        plates = 0,
        state = "confirmed",
        physical = false;
      const snapshots = [];
      for (const line of d.items) {
        const p = one<{
          id: string;
          name: string;
          kind: string;
          is_plate: number;
          controls_stock: number;
          stock_inventory_id: string;
          cost: number;
        }>("SELECT * FROM products WHERE id=? AND active=1", line.product_id);
        if (!p) throw new Error("Produto não disponível.");
        let unit = 0,
          origin = "Composição atual",
          itemState = "confirmed";
        let components = all<{
          inventory_id: string;
          quantity: number;
          cost: number;
          cost_status: string;
          cost_origin: string;
        }>(
          `SELECT c.inventory_id,c.quantity,i.cost,i.cost_status,i.cost_origin FROM product_components c JOIN inventory_items i ON i.id=c.inventory_id WHERE c.product_id=?`,
          p.id,
        );
        if (p.kind === "service") {
          if (line.service_cost === null) {
            itemState = "unknown";
            origin = "Serviço sem custo informado";
          } else {
            unit = line.service_cost;
            origin = "Custo de serviço informado";
          }
        } else {
          physical = true;
          if (line.from_stock) {
            const m = p.stock_inventory_id
              ? one<{
                  id: string;
                  quantity: number;
                  quantity_known: number;
                  cost: number;
                  cost_status: string;
                  cost_origin: string;
                }>(
                  "SELECT * FROM inventory_items WHERE id=?",
                  p.stock_inventory_id,
                )
              : undefined;
            if (!m || !m.quantity_known || m.quantity < line.quantity)
              throw new Error(
                "Estoque de produto pronto não confirmado ou insuficiente.",
              );
            components = [
              {
                inventory_id: m.id,
                quantity: 1,
                cost: m.cost,
                cost_status: m.cost_status,
                cost_origin: "Produto pronto; não baixar componentes",
              },
            ];
          }
          unit = components.reduce((s, c) => s + c.cost * c.quantity, 0);
          itemState = components.some((c) => c.cost_status === "unknown")
            ? "unknown"
            : components.some((c) => c.cost_status === "estimated")
              ? "estimated"
              : "confirmed";
          if (!components.length) unit = p.cost;
          if (line.lot_id && !line.from_stock) {
            const lot = one<{
              inventory_id: string;
              unit_cost: number;
              code: string;
              receipt_status: string;
            }>("SELECT * FROM inventory_lots WHERE id=?", line.lot_id);
            if (
              !lot ||
              !components.some((c) => c.inventory_id === lot.inventory_id)
            )
              throw new Error("Lote não pertence ao produto.");
            components = components.map((c) =>
              c.inventory_id === lot.inventory_id
                ? {
                    ...c,
                    cost: lot.unit_cost,
                    cost_origin: "Lote " + lot.code,
                    cost_status:
                      lot.receipt_status === "historical_review"
                        ? "estimated"
                        : "confirmed",
                  }
                : c,
            );
            unit = components.reduce((s, c) => s + c.cost * c.quantity, 0);
            itemState = components.some((c) => c.cost_status === "unknown")
              ? "unknown"
              : components.some((c) => c.cost_status === "estimated")
                ? "estimated"
                : "confirmed";
            origin = "Lote " + lot.code;
          }
        }
        if (itemState === "unknown") state = "unknown";
        else if (itemState === "estimated" && state !== "unknown")
          state = "estimated";
        cost += Math.round(unit * line.quantity);
        if (p.is_plate) plates += line.quantity;
        insert("sale_items", {
          sale_id: sid,
          product_id: p.id,
          product_name: p.name,
          quantity: line.quantity,
          price: allocated ? Math.floor(line.line_total! / line.quantity) : 0,
          cost: Math.round(unit),
          unit_cost_precise: unit,
          cost_total: Math.round(unit * line.quantity),
          is_plate: p.is_plate,
          margin: 0,
          components_snapshot: JSON.stringify(components),
          cost_status: itemState,
          cost_origin: origin,
          line_total: line.line_total,
          revenue_known: Number(allocated),
        });
        snapshots.push({
          product_id: p.id,
          quantity: line.quantity,
          components,
        });
      }
      run(
        "UPDATE sales SET cost=?,profit=?,margin=?,plates=?,cost_status=?,cost_known=? WHERE id=?",
        cost,
        d.total - cost,
        (100 * (d.total - cost)) / d.total,
        plates,
        state,
        Number(state !== "unknown"),
        sid,
      );
      let oid: string | undefined;
      if (physical) {
        oid = insert("orders", {
          sale_id: sid,
          company_id: cid,
          status: "Pedido recebido",
          notes: d.notes,
          item_snapshot: JSON.stringify(snapshots),
        });
        insert("order_events", {
          order_id: oid,
          user_id: user.id,
          type: "Pedido recebido",
          notes: "Venda rápida",
        });
      }
      if (
        oid &&
        !d.defer_production &&
        d.items.every(
          (l) =>
            l.from_stock ||
            one<{ kind: string }>(
              "SELECT kind FROM products WHERE id=?",
              l.product_id,
            )?.kind === "service",
        )
      ) {
        const needs = new Map<string, number>();
        for (const line of snapshots)
          for (const c of line.components)
            needs.set(
              c.inventory_id,
              (needs.get(c.inventory_id) || 0) + line.quantity * c.quantity,
            );
        for (const [id, qty] of needs) {
          const m = one<{ quantity: number; quantity_known: number }>(
            "SELECT quantity,quantity_known FROM inventory_items WHERE id=?",
            id,
          )!;
          const reserved = one<{ q: number }>(
            "SELECT COALESCE(sum(quantity),0) q FROM inventory_reservations WHERE inventory_id=? AND status='reserved'",
            id,
          )!.q;
          if (!m.quantity_known || m.quantity - reserved < qty)
            throw new Error("Produto pronto reservado ou saldo insuficiente.");
          run(
            "UPDATE inventory_items SET quantity=quantity-? WHERE id=?",
            qty,
            id,
          );
          insert("inventory_movements", {
            inventory_id: id,
            user_id: user.id,
            order_id: oid,
            quantity: -qty,
            type: "Separação de produto pronto",
            description: "Sem nova baixa de componentes",
          });
        }
        run(
          "UPDATE orders SET status='Pronto para entrega',produced_at=CURRENT_TIMESTAMP WHERE id=?",
          oid,
        );
        insert("order_events", {
          order_id: oid,
          user_id: user.id,
          type: "Separação confirmada",
          notes: "Produto pronto; não baixar componentes novamente.",
        });
      }
      if (paid > 0)
        insert("payments", {
          sale_id: sid,
          amount: paid,
          method: d.method,
          date: d.date,
        });
      run("UPDATE companies SET is_customer=1,status='Venda' WHERE id=?", cid);
      activity(cid, user.id, "Venda", "Venda rápida registrada");
      audit(user.id, "Venda rápida", sid);
      return { id: sid, company_id: cid, order_id: oid };
    }
    if (action === "contact") {
      const d = operationSchemas.contact.parse(parsed);
      const id = insert("contact_events", { ...d, user_id: user.id });
      activity(
        d.company_id,
        user.id,
        d.type,
        `${d.phone}\n${d.text}\nResultado: ${d.result}`,
      );
      if (["Mensagem enviada", "Ligação", "Visita"].includes(d.type))
        run(
          "UPDATE companies SET status='Contato realizado' WHERE id=? AND status='Novo lead'",
          d.company_id,
        );
      if (d.next_at)
        insert("followups", {
          company_id: d.company_id,
          date: d.next_at,
          reason: "Retorno combinado",
          responsible: user.name,
          done: 0,
        });
      return { id };
    }
    if (action === "stage_confirm") {
      const d = operationSchemas.stage_confirm.parse(parsed);
      if (
        d.status === "Contato realizado" &&
        !one(
          "SELECT id FROM contact_events WHERE company_id=? AND type IN('Mensagem enviada','Ligação','Visita')",
          d.company_id,
        )
      )
        throw new Error("Confirme contato efetivo antes de mudar etapa.");
      if (d.status === "Perdido" && d.reason.trim().length < 3)
        throw new Error("Informe motivo da perda.");
      run("UPDATE companies SET status=? WHERE id=?", d.status, d.company_id);
      activity(
        d.company_id,
        user.id,
        "Etapa comercial",
        d.status + " " + d.reason,
      );
      return { id: d.company_id };
    }
    if (action === "proposal") {
      const d = operationSchemas.proposal.parse(parsed);
      const id = insert("proposals", { ...d, user_id: user.id });
      activity(d.company_id, user.id, "Proposta em rascunho", d.text);
      return { id };
    }
    if (action === "cash_entry")
      return {
        id: insert("cash_entries", {
          ...operationSchemas.cash_entry.parse(parsed),
          user_id: user.id,
        }),
      };
    if (action === "stock_count") {
      const d = operationSchemas.stock_count.parse(parsed);
      const i = one<{ quantity: number; quantity_known: number }>(
        "SELECT * FROM inventory_items WHERE id=?",
        d.id,
      );
      if (!i) throw new Error("Material não encontrado.");
      insert("inventory_counts", {
        inventory_id: d.id,
        previous_quantity: i.quantity_known ? i.quantity : null,
        quantity: d.quantity,
        date: d.date,
        initial: Number(!i.quantity_known || d.initial),
        notes: d.notes,
        user_id: user.id,
      });
      insert("inventory_movements", {
        inventory_id: d.id,
        user_id: user.id,
        quantity: d.quantity - (i.quantity_known ? i.quantity : 0),
        type: "Contagem física",
        description: d.notes,
      });
      run(
        "UPDATE inventory_items SET quantity=?,quantity_known=1,stock_confirmed_at=? WHERE id=?",
        d.quantity,
        d.date,
        d.id,
      );
      return { id: d.id };
    }
    if (action === "material_cost") {
      const d = operationSchemas.material_cost.parse(parsed);
      run(
        "UPDATE inventory_items SET cost=?,cost_status=?,cost_origin=? WHERE id=?",
        d.cost,
        d.status,
        d.origin,
        d.id,
      );
      return { id: d.id };
    }
    if (action === "payment_set") {
      const d = operationSchemas.payment_set.parse(parsed);
      const s = one<{ total: number }>(
        "SELECT total FROM sales WHERE id=?",
        d.id,
      );
      if (!s) throw new Error("Venda não encontrada.");
      const paid = one<{ paid: number }>(
        "SELECT COALESCE(sum(amount),0) paid FROM payments WHERE sale_id=?",
        d.id,
      )!.paid;
      if (d.status === "unknown" && paid)
        throw new Error("Não apague recebimentos confirmados.");
      const amount =
        d.status === "received"
          ? s.total - paid
          : d.status === "partial"
            ? d.amount || 0
            : 0;
      if ((d.status === "partial" && !amount) || amount + paid > s.total)
        throw new Error("Valor de recebimento inválido.");
      if (amount && !d.date) throw new Error("Informe data do recebimento.");
      run(
        "UPDATE sales SET payment_known=? WHERE id=?",
        Number(d.status !== "unknown"),
        d.id,
      );
      if (amount)
        insert("payments", {
          sale_id: d.id,
          amount,
          date: d.date!,
          method: d.method,
        });
      return { id: d.id };
    }
    if (action === "lot_review") {
      const d = operationSchemas.lot_review.parse(parsed);
      const l = one<{ quantity: number; notes: string }>(
        "SELECT quantity,notes FROM inventory_lots WHERE id=?",
        d.id,
      );
      if (!l || d.current_received > l.quantity)
        throw new Error("Confira quantidade total recebida.");
      run(
        "UPDATE inventory_lots SET received=?,receipt_status='reviewed_reference',notes=? WHERE id=?",
        d.current_received,
        l.notes + "\nConferência sem entrada automática: " + d.notes,
        d.id,
      );
      audit(user.id, action, d.id);
      return { id: d.id };
    }
    if (action === "lot_purchase") {
      const d = operationSchemas.lot_purchase.parse(parsed);
      if (d.received > d.quantity || (d.paid || 0) > d.amount + d.freight)
        throw new Error("Quantidade recebida ou pagamento excede a compra.");
      if (d.paid && !d.date) throw new Error("Informe data do pagamento.");
      if (
        one(
          "SELECT id FROM inventory_lots WHERE inventory_id=? AND code=?",
          d.inventory_id,
          d.code,
        )
      )
        throw new Error("Lote já cadastrado.");
      const i = one<{ quantity: number; quantity_known: number; cost: number }>(
        "SELECT * FROM inventory_items WHERE id=?",
        d.inventory_id,
      );
      if (!i) throw new Error("Material não encontrado.");
      if (d.received && !i.quantity_known)
        throw new Error("Confirme saldo físico antes de receber.");
      const unit = (d.amount + d.freight) / d.quantity;
      const id = insert("inventory_lots", {
        inventory_id: d.inventory_id,
        code: d.code,
        quantity: d.quantity,
        amount: d.amount,
        freight: d.freight,
        unit_cost: unit,
        received: d.received,
        purchase_date: d.date,
        supplier: d.supplier,
        paid: d.paid || 0,
        paid_known: Number(d.paid !== null),
        financial_date: d.paid ? d.date : null,
        receipt_status: "confirmed",
        notes: d.notes,
        user_id: user.id,
      });
      if (d.paid)
        insert("lot_payments", {
          lot_id: id,
          amount: d.paid,
          date: d.date,
          user_id: user.id,
        });
      if (d.received) {
        run(
          "UPDATE inventory_items SET quantity=?,cost=?,cost_status=? WHERE id=?",
          i.quantity + d.received,
          Math.round(
            (i.quantity * i.cost + d.received * unit) /
              (i.quantity + d.received),
          ),
          "confirmed",
          d.inventory_id,
        );
        insert("inventory_movements", {
          inventory_id: d.inventory_id,
          user_id: user.id,
          quantity: d.received,
          type: "Entrada",
          description: "Lote " + d.code,
        });
      }
      audit(user.id, action, id);
      return { id };
    }
    if (action === "lot_receive" || action === "lot_payment") {
      const d =
        action === "lot_receive"
          ? operationSchemas.lot_receive.parse(parsed)
          : operationSchemas.lot_payment.parse(parsed);
      const l = one<{
        id: string;
        inventory_id: string;
        quantity: number;
        received: number;
        unit_cost: number;
        receipt_status: string;
        paid: number;
        amount: number;
        freight: number;
        code: string;
      }>("SELECT * FROM inventory_lots WHERE id=?", d.id);
      if (!l || l.receipt_status === "historical_review")
        throw new Error("Lote histórico a revisar ou não encontrado.");
      if ("quantity" in d) {
        if (d.quantity + l.received > l.quantity)
          throw new Error("Recebimento excede o lote.");
        const i = one<{
          quantity: number;
          quantity_known: number;
          cost: number;
        }>("SELECT * FROM inventory_items WHERE id=?", l.inventory_id)!;
        if (!i.quantity_known) throw new Error("Saldo físico a conferir.");
        run(
          "UPDATE inventory_lots SET received=received+? WHERE id=?",
          d.quantity,
          l.id,
        );
        run(
          "UPDATE inventory_items SET quantity=?,cost=?,cost_status=? WHERE id=?",
          i.quantity + d.quantity,
          Math.round(
            (i.quantity * i.cost + d.quantity * l.unit_cost) /
              (i.quantity + d.quantity),
          ),
          "confirmed",
          l.inventory_id,
        );
        insert("inventory_movements", {
          inventory_id: l.inventory_id,
          user_id: user.id,
          quantity: d.quantity,
          type: "Entrada",
          description: "Lote " + l.code,
        });
      } else {
        if (l.paid + d.amount > l.amount + l.freight)
          throw new Error("Pagamento excede o saldo.");
        run(
          "UPDATE inventory_lots SET paid=paid+?,paid_known=1,financial_date=? WHERE id=?",
          d.amount,
          d.date,
          l.id,
        );
        insert("lot_payments", {
          lot_id: l.id,
          amount: d.amount,
          date: d.date,
          user_id: user.id,
        });
      }
      audit(user.id, action, l.id);
      return { id: l.id };
    }
    if (action === "product_stock") {
      const d = operationSchemas.product_stock.parse(parsed);
      run(
        "UPDATE products SET stock_inventory_id=? WHERE id=?",
        d.inventory_id,
        d.id,
      );
      return { id: d.id };
    }
    if (action === "order_items") {
      const d = operationSchemas.order_items.parse(parsed);
      const o = one<{ status: string; produced_at: string | null }>(
        "SELECT * FROM orders WHERE id=?",
        d.id,
      );
      if (!o || o.produced_at || o.status === "Cancelado")
        throw new Error("Só edite antes de produzir.");
      const snapshots = d.items.map((l) => {
        const p = one<{ kind: string; stock_inventory_id: string }>(
          "SELECT * FROM products WHERE id=?",
          l.product_id,
        );
        if (!p || p.kind === "service")
          throw new Error("Escolha solução física.");
        const components = l.from_stock
          ? p.stock_inventory_id
            ? [{ inventory_id: p.stock_inventory_id, quantity: 1 }]
            : []
          : all(
              "SELECT inventory_id,quantity FROM product_components WHERE product_id=?",
              l.product_id,
            );
        if (!components.length)
          throw new Error("Composição física a conferir.");
        return { product_id: l.product_id, quantity: l.quantity, components };
      });
      run(
        "UPDATE inventory_reservations SET status='released' WHERE order_id=? AND status='reserved'",
        d.id,
      );
      run(
        "UPDATE orders SET item_snapshot=? WHERE id=?",
        JSON.stringify(snapshots),
        d.id,
      );
      insert("order_events", {
        order_id: d.id,
        user_id: user.id,
        type: "Itens revisados",
        notes: "Reservas liberadas; venda histórica preservada.",
      });
      return { id: d.id };
    }
    if (action === "direct_order") {
      const d = operationSchemas.direct_order.parse(parsed);
      const p = one<{ kind: string }>(
        "SELECT * FROM products WHERE id=?",
        d.product_id,
      );
      if (!p || p.kind === "service")
        throw new Error("Escolha solução física.");
      const components = all(
        "SELECT inventory_id,quantity FROM product_components WHERE product_id=?",
        d.product_id,
      );
      const id = insert("orders", {
        company_id: d.company_id,
        sale_id: null,
        status: "Pedido recebido",
        notes: d.notes,
        promised_date: d.promised_date,
        item_snapshot: JSON.stringify([
          { product_id: d.product_id, quantity: d.quantity, components },
        ]),
      });
      insert("order_events", {
        order_id: id,
        user_id: user.id,
        type: "Pedido recebido",
        notes: "Pedido direto",
      });
      return { id };
    }
    if (action === "order_update") {
      const d = operationSchemas.order_update.parse(parsed);
      const o = one<{ status: string; produced_at: string | null }>(
        "SELECT * FROM orders WHERE id=?",
        d.id,
      );
      if (!o) throw new Error("Pedido não encontrado.");
      if (
        [
          "Produção",
          "Pronto para entrega",
          "Saiu para entrega",
          "Entregue",
        ].includes(d.status) &&
        ![
          "Arte aprovada",
          "Produção",
          "Pronto para entrega",
          "Saiu para entrega",
          "Entregue",
        ].includes(o.status)
      )
        throw new Error("Registre aprovação.");
      if (
        ["Pronto para entrega", "Saiu para entrega", "Entregue"].includes(
          d.status,
        ) &&
        !o.produced_at
      )
        throw new Error("Confirme produção.");
      if (d.status === "Cancelado" && d.notes.trim().length < 3)
        throw new Error("Informe motivo do cancelamento.");
      if (d.status === "Cancelado")
        run(
          "UPDATE inventory_reservations SET status='released' WHERE order_id=? AND status='reserved'",
          d.id,
        );
      run(
        "UPDATE orders SET status=?,notes=?,promised_date=?,responsible_id=? WHERE id=?",
        d.status,
        d.notes,
        d.promised_date,
        d.responsible_id,
        d.id,
      );
      insert("order_events", {
        order_id: d.id,
        user_id: user.id,
        type: d.status,
        notes: o.status + " → " + d.status + " " + d.notes,
      });
      return { id: d.id };
    }
    if (action === "reserve" || action === "produce") {
      const d = operationSchemas[action].parse(parsed);
      const o = one<{
        status: string;
        produced_at: string | null;
        sale_id: string;
        item_snapshot: string;
      }>("SELECT * FROM orders WHERE id=?", d.id);
      if (!o || o.status === "Cancelado")
        throw new Error("Pedido não disponível.");
      if (
        action === "produce" &&
        (o.produced_at || !["Arte aprovada", "Produção"].includes(o.status))
      )
        throw new Error(
          "Produção exige aprovação e só pode ser baixada uma vez.",
        );
      let lines = JSON.parse(o.item_snapshot || "[]") as {
        quantity: number;
        components: { inventory_id: string; quantity: number }[];
      }[];
      if (!lines.length)
        lines = all<{ quantity: number; components_snapshot: string }>(
          "SELECT quantity,components_snapshot FROM sale_items WHERE sale_id=?",
          o.sale_id,
        ).map((i) => ({
          quantity: i.quantity,
          components: JSON.parse(i.components_snapshot),
        }));
      const needed = new Map<string, number>();
      for (const l of lines)
        for (const c of l.components)
          needed.set(
            c.inventory_id,
            (needed.get(c.inventory_id) || 0) + c.quantity * l.quantity,
          );
      if (!needed.size) throw new Error("Composição física a conferir.");
      for (const [id, qty] of needed) {
        const i = one<{ quantity: number; quantity_known: number }>(
          "SELECT * FROM inventory_items WHERE id=?",
          id,
        );
        const reserved = one<{ qty: number }>(
          "SELECT COALESCE(sum(quantity),0) qty FROM inventory_reservations WHERE inventory_id=? AND status='reserved' AND order_id<>?",
          id,
          d.id,
        )!.qty;
        if (!i || !i.quantity_known || i.quantity - reserved < qty)
          throw new Error(
            "Material a conferir ou saldo disponível insuficiente.",
          );
        if (action === "reserve") {
          run(
            "UPDATE inventory_reservations SET status='released' WHERE inventory_id=? AND order_id=? AND status='reserved'",
            id,
            d.id,
          );
          insert("inventory_reservations", {
            order_id: d.id,
            inventory_id: id,
            quantity: qty,
            status: "reserved",
          });
        } else {
          run(
            "UPDATE inventory_items SET quantity=quantity-? WHERE id=?",
            qty,
            id,
          );
          insert("inventory_movements", {
            inventory_id: id,
            user_id: user.id,
            order_id: d.id,
            quantity: -qty,
            type: "Produção",
            description: "Consumo real confirmado, uma vez",
          });
        }
      }
      if (action === "produce") {
        run(
          "UPDATE orders SET status='Pronto para entrega',produced_at=CURRENT_TIMESTAMP WHERE id=?",
          d.id,
        );
        run(
          "UPDATE inventory_reservations SET status='consumed' WHERE order_id=? AND status='reserved'",
          d.id,
        );
      }
      insert("order_events", {
        order_id: d.id,
        user_id: user.id,
        type:
          action === "produce" ? "Produção confirmada" : "Reserva de materiais",
        notes: "Reserva não representa consumo.",
      });
      audit(user.id, action, d.id);
      return { id: d.id };
    }
    throw new Error("Operação não reconhecida.");
  });
}
