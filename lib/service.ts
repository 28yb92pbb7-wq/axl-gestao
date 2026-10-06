import { mutationSchemas } from "./mutation-schemas";
import { z } from "zod";
import { all, one, run, insert, transaction, audit, activity } from "./db";
import {
  calculateSale,
  commission,
  stockRequirements,
  defaultWeights,
} from "./domain";
import { hashPassword, verifyPassword, type User } from "./auth";
import type { Product, Seller, State } from "./types";
export function readState(): State {
  return {
    backend: "local",
    profiles: all(
      "SELECT id,name,email,role,created_at FROM profiles ORDER BY name",
    ),
    saleItems: all("SELECT * FROM sale_items"),
    payments: all("SELECT * FROM payments ORDER BY date DESC"),
    companies: all(
      "SELECT * FROM companies WHERE deleted_at IS NULL ORDER BY name",
    ),
    products: all("SELECT * FROM products ORDER BY name"),
    sales: all(
      "SELECT s.*,c.name company_name,COALESCE((SELECT SUM(amount) FROM payments WHERE sale_id=s.id),0) paid FROM sales s JOIN companies c ON c.id=s.company_id ORDER BY s.date DESC,s.number DESC",
    ),
    orders: all(
      "SELECT o.*,s.number,c.name company_name FROM orders o JOIN sales s ON s.id=o.sale_id JOIN companies c ON c.id=s.company_id ORDER BY o.created_at DESC",
    ),
    inventory: all("SELECT * FROM inventory_items ORDER BY name"),
    activities: all("SELECT * FROM activities ORDER BY created_at DESC"),
    followups: all(
      "SELECT f.*,c.name company_name FROM followups f JOIN companies c ON c.id=f.company_id ORDER BY f.date",
    ),
    salespeople: all("SELECT * FROM salespeople"),
    expenses: all("SELECT * FROM expenses ORDER BY date DESC"),
    goals: all("SELECT * FROM goals"),
    components: all("SELECT * FROM product_components"),
    movements: all(
      "SELECT m.*,i.name FROM inventory_movements m JOIN inventory_items i ON i.id=m.inventory_id ORDER BY m.created_at DESC",
    ),
    routes: all("SELECT * FROM routes ORDER BY date DESC"),
    stops: all(
      "SELECT r.*,c.name,c.address,c.city FROM route_stops r JOIN companies c ON c.id=r.company_id ORDER BY position",
    ),
    audit: all(
      "SELECT a.*,p.name FROM audit_logs a JOIN profiles p ON p.id=a.user_id ORDER BY a.created_at DESC LIMIT 100",
    ),
    weights: JSON.parse(
      one<{ value: string }>(
        "SELECT value FROM settings WHERE key=?",
        "score_weights",
      )?.value || JSON.stringify(defaultWeights),
    ),
  };
}
const uuid = z.uuid();
function exists(table: string, id: string) {
  if (!one(`SELECT id FROM ${table} WHERE id=?`, id))
    throw new Error("Registro não encontrado.");
}
export function mutate(action: string, input: unknown, user: User) {
  if (user.role !== "ADMIN")
    throw new Error("Esta versão permite operações somente ao administrador.");
  return transaction(() => {
    switch (action) {
      case "company": {
        const data = mutationSchemas.company.parse(input);
        const id = z.object({ id: uuid.optional() }).parse(input).id;
        const row = {
          ...data,
          is_customer: Number(data.is_customer),
          is_lead: Number(data.is_lead),
        };
        if (id) {
          exists("companies", id);
          const keys = Object.keys(row);
          run(
            `UPDATE companies SET ${keys.map((k) => k + "=?").join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            ...Object.values(row),
            id,
          );
          activity(
            id,
            user.id,
            "Alteração",
            "Cadastro atualizado; histórico preservado.",
          );
          audit(user.id, "Cliente/lead alterado", id);
          return id;
        }
        const created = insert("companies", row);
        activity(
          created,
          user.id,
          "Cadastro",
          data.is_customer ? "Cliente cadastrado" : "Lead criado",
        );
        audit(user.id, "Empresa criada", created);
        return created;
      }
      case "product": {
        const data = mutationSchemas.product.parse(input);
        const id = z.object({ id: uuid.optional() }).parse(input).id;
        const row = {
          ...data,
          is_plate: Number(data.is_plate),
          active: Number(data.active),
          uses_nfc: Number(data.uses_nfc),
          uses_acrylic: Number(data.uses_acrylic),
          controls_stock: Number(data.controls_stock),
        };
        if (id) {
          exists("products", id);
          const keys = Object.keys(row);
          run(
            `UPDATE products SET ${keys.map((k) => k + "=?").join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`,
            ...Object.values(row),
            id,
          );
          audit(user.id, "Produto alterado", id);
          return id;
        }
        const created = insert("products", row);
        audit(user.id, "Produto criado", created);
        return created;
      }
      case "sale": {
        const data = mutationSchemas.sale.parse(input);
        exists("companies", data.company_id);
        const items = data.items.map((item) => {
          const product = one<Product>(
            "SELECT * FROM products WHERE id=? AND active=1",
            item.product_id,
          );
          if (!product) throw new Error("Produto indisponível.");
          const components = all<{
            inventory_id: string;
            quantity: number;
            cost: number;
          }>(
            "SELECT c.inventory_id,c.quantity,i.cost FROM product_components c JOIN inventory_items i ON i.id=c.inventory_id WHERE c.product_id=?",
            product.id,
          );
          const cost = components.length
            ? Math.round(
                components.reduce((s, c) => s + c.quantity * c.cost, 0),
              )
            : product.cost;
          return {
            ...item,
            cost,
            is_plate: !!product.is_plate,
            product_name: product.name,
            controls_stock: !!product.controls_stock,
            components,
          };
        });
        const totals = calculateSale(items);
        if (!totals.total)
          throw new Error("A venda deve ter valor maior que zero.");
        if (data.paid > totals.total)
          throw new Error("Pagamento maior que o valor da venda.");
        if (!Number.isSafeInteger(totals.total) || totals.total > 1000000000)
          throw new Error("Valor da venda acima do limite.");
        const seller = data.salesperson_id
          ? one<Seller>(
              "SELECT * FROM salespeople WHERE id=?",
              data.salesperson_id,
            )
          : undefined;
        if (data.salesperson_id && !seller)
          throw new Error("Vendedor inválido.");
        const rule = {
          type: (seller?.commission_type || "percent") as
            "percent" | "plate" | "margin",
          value: seller?.commission_value || 0,
        };
        const number =
          (one<{ n: number }>("SELECT MAX(number) n FROM sales")?.n || 0) + 1;
        const id = insert("sales", {
          number,
          company_id: data.company_id,
          salesperson_id: data.salesperson_id,
          date: data.date,
          ...{
            total: totals.total,
            cost: totals.cost,
            profit: totals.profit,
            plates: totals.plates,
            margin: totals.margin,
          },
          commission: commission(
            totals.total,
            totals.profit,
            totals.plates,
            rule,
          ),
          commission_rule: JSON.stringify(rule),
          method: data.method,
          due_date: data.due_date,
          notes: data.notes,
        });
        for (const item of items)
          insert("sale_items", {
            sale_id: id,
            product_id: item.product_id,
            product_name: item.product_name,
            quantity: item.quantity,
            price: item.price,
            cost: item.cost,
            is_plate: Number(item.is_plate),
            margin: item.price
              ? (100 * (item.price - item.cost)) / item.price
              : 0,
            components_snapshot: JSON.stringify(
              item.controls_stock ? item.components : [],
            ),
          });
        if (data.paid)
          insert("payments", {
            sale_id: id,
            amount: data.paid,
            method: data.method,
            date: data.date,
          });
        insert("orders", { sale_id: id, status: "Pedido recebido" });
        run(
          "UPDATE companies SET is_customer=1,status='Venda',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          data.company_id,
        );
        activity(
          data.company_id,
          user.id,
          "Venda",
          `Venda #${number} registrada. Preços, custos, composição e comissão preservados.`,
        );
        audit(user.id, "Venda criada", id);
        return id;
      }
      case "stage": {
        const d = mutationSchemas.stage.parse(input);
        exists("companies", d.id);
        if (d.status === "Perdido" && !d.reason.trim())
          throw new Error("Informe o motivo de perda.");
        run(
          "UPDATE companies SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          d.status,
          d.id,
        );
        activity(
          d.id,
          user.id,
          "Status",
          `${d.status}${d.reason ? " — " + d.reason : ""}`,
        );
        audit(user.id, "Status do lead alterado", d.id);
        break;
      }
      case "activity": {
        const d = mutationSchemas.activity.parse(input);
        exists("companies", d.company_id);
        activity(d.company_id, user.id, d.type, d.description);
        audit(user.id, "Atividade registrada", d.company_id);
        break;
      }
      case "followup": {
        const d = mutationSchemas.followup.parse(input);
        exists("companies", d.company_id);
        insert("followups", d);
        activity(d.company_id, user.id, "Follow-up", `${d.reason} — ${d.date}`);
        audit(user.id, "Retorno agendado", d.company_id);
        break;
      }
      case "followup_done": {
        const d = mutationSchemas.followup_done.parse(input);
        exists("followups", d.id);
        run("UPDATE followups SET done=1 WHERE id=?", d.id);
        audit(user.id, "Retorno concluído", d.id);
        break;
      }
      case "order": {
        const d = mutationSchemas.order.parse(input);
        const order = one<{ produced_at: string | null; company_id: string }>(
          "SELECT o.*,s.company_id FROM orders o JOIN sales s ON s.id=o.sale_id WHERE o.id=?",
          d.id,
        );
        if (!order) throw new Error("Pedido não encontrado.");
        if (
          ["Pronto para entrega", "Saiu para entrega", "Entregue"].includes(
            d.status,
          ) &&
          !order.produced_at
        )
          throw new Error("Marque o pedido como produzido antes desta etapa.");
        run(
          "UPDATE orders SET status=?,promised_date=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          d.status,
          d.promised_date || null,
          d.notes,
          d.id,
        );
        activity(
          order.company_id,
          user.id,
          "Pedido",
          `Pedido atualizado: ${d.status}`,
        );
        audit(user.id, "Pedido alterado", d.id);
        break;
      }
      case "produce": {
        const d = mutationSchemas.produce.parse(input);
        const order = one<{
          sale_id: string;
          produced_at: string | null;
          status: string;
          company_id: string;
        }>(
          "SELECT o.*,s.company_id FROM orders o JOIN sales s ON s.id=o.sale_id WHERE o.id=?",
          d.id,
        );
        if (!order) throw new Error("Pedido não encontrado.");
        if (order.produced_at)
          throw new Error(
            "Pedido já produzido. Nenhum estoque foi baixado novamente.",
          );
        if (order.status !== "Produção" && order.status !== "Arte aprovada")
          throw new Error(
            "Aprove a arte ou avance para Produção antes de produzir.",
          );
        const lines = all<{ quantity: number; components_snapshot: string }>(
          "SELECT * FROM sale_items WHERE sale_id=?",
          order.sale_id,
        );
        const required = stockRequirements(
          lines.map((l) => ({
            quantity: l.quantity,
            components: JSON.parse(l.components_snapshot),
          })),
        );
        for (const [inventoryId, quantity] of Object.entries(required)) {
          const stock = one<{ quantity: number; name: string }>(
            "SELECT quantity,name FROM inventory_items WHERE id=?",
            inventoryId,
          );
          if (!stock || stock.quantity < quantity)
            throw new Error(
              `Estoque insuficiente: ${stock?.name || "material"}.`,
            );
        }
        for (const [inventoryId, quantity] of Object.entries(required)) {
          run(
            "UPDATE inventory_items SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            quantity,
            inventoryId,
          );
          insert("inventory_movements", {
            inventory_id: inventoryId,
            quantity: -quantity,
            type: "Produção",
            description: "Baixa automática pela composição registrada na venda",
            order_id: d.id,
          });
        }
        run(
          "UPDATE orders SET produced_at=CURRENT_TIMESTAMP,status='Pronto para entrega',updated_at=CURRENT_TIMESTAMP WHERE id=?",
          d.id,
        );
        activity(
          order.company_id,
          user.id,
          "Produção",
          "Pedido produzido e estoque baixado.",
        );
        audit(user.id, "Pedido produzido", d.id);
        break;
      }
      case "payment": {
        const d = mutationSchemas.payment.parse(input);
        const sale = one<{ total: number; paid: number; company_id: string }>(
          "SELECT s.*,COALESCE((SELECT SUM(amount) FROM payments WHERE sale_id=s.id),0) paid FROM sales s WHERE s.id=?",
          d.sale_id,
        );
        if (!sale) throw new Error("Venda não encontrada.");
        if (d.amount > sale.total - sale.paid)
          throw new Error("Valor supera o saldo a receber.");
        const id = insert("payments", d);
        activity(
          sale.company_id,
          user.id,
          "Pagamento",
          "Pagamento registrado.",
        );
        audit(user.id, "Pagamento registrado", id);
        break;
      }
      case "expense": {
        const d = mutationSchemas.expense.parse(input);
        const id = insert("expenses", { ...d, paid: Number(d.paid) });
        audit(user.id, "Despesa cadastrada", id);
        break;
      }
      case "stock": {
        const d = mutationSchemas.stock.parse(input);
        const item = one<{ quantity: number }>(
          "SELECT quantity FROM inventory_items WHERE id=?",
          d.id,
        );
        if (!item || item.quantity + d.quantity < 0)
          throw new Error("A movimentação deixaria estoque negativo.");
        if (
          (["Saída", "Perda"].includes(d.type) && d.quantity > 0) ||
          (["Entrada", "Devolução"].includes(d.type) && d.quantity < 0)
        )
          throw new Error(
            "Use quantidade negativa para saída e positiva para entrada.",
          );
        run(
          "UPDATE inventory_items SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          d.quantity,
          d.id,
        );
        insert("inventory_movements", {
          inventory_id: d.id,
          quantity: d.quantity,
          type: d.type,
          description: d.description,
        });
        audit(user.id, "Estoque movimentado", d.id);
        break;
      }
      case "purchase": {
        const d = mutationSchemas.purchase.parse(input);
        const stock = one<{ quantity: number; cost: number }>(
          "SELECT * FROM inventory_items WHERE id=?",
          d.inventory_id,
        );
        if (!stock) throw new Error("Material não encontrado.");
        const cost = Math.round(
          (stock.quantity * stock.cost + d.total) /
            (stock.quantity + d.quantity),
        );
        insert("purchases", {
          inventory_id: d.inventory_id,
          supplier: d.supplier,
          quantity: d.quantity,
          total: d.total,
          date: d.date,
        });
        run(
          "UPDATE inventory_items SET quantity=quantity+?,cost=?,supplier=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          d.quantity,
          cost,
          d.supplier,
          d.inventory_id,
        );
        insert("inventory_movements", {
          inventory_id: d.inventory_id,
          quantity: d.quantity,
          type: "Entrada",
          description: `Compra — ${d.supplier}`,
        });
        insert("expenses", {
          description: `Compra de material — ${d.supplier}`,
          category: "Matéria-prima",
          amount: d.total,
          date: d.date,
          paid: Number(d.paid),
        });
        audit(user.id, "Compra de material", d.inventory_id);
        break;
      }
      case "goal": {
        const d = mutationSchemas.goal.parse(input);
        exists("goals", d.id);
        run("UPDATE goals SET amount=? WHERE id=?", d.amount, d.id);
        audit(user.id, "Meta alterada", d.id);
        break;
      }
      case "seller": {
        const d = mutationSchemas.seller.parse(input);
        if (d.commission_type !== "plate" && d.commission_value > 100)
          throw new Error("Percentual deve ser entre 0 e 100.");
        const id = insert("salespeople", d);
        audit(user.id, "Vendedor criado", id);
        break;
      }
      case "route": {
        const d = mutationSchemas.route.parse(input);
        const unique = [...new Set(d.companies)];
        unique.forEach((id) => exists("companies", id));
        const id = insert("routes", {
          name: d.name,
          date: d.date,
          salesperson_id: d.salesperson_id,
        });
        unique.forEach((company_id, position) =>
          insert("route_stops", { route_id: id, company_id, position }),
        );
        audit(user.id, "Rota criada", id);
        break;
      }
      case "stop": {
        const d = mutationSchemas.stop.parse(input);
        const stop = one<{ company_id: string }>(
          "SELECT * FROM route_stops WHERE id=?",
          d.id,
        );
        if (!stop) throw new Error("Parada não encontrada.");
        run("UPDATE route_stops SET status=? WHERE id=?", d.status, d.id);
        activity(stop.company_id, user.id, "Visita", d.status);
        audit(user.id, "Visita registrada", d.id);
        break;
      }
      case "user": {
        const d = mutationSchemas.user.parse(input);
        const id = insert("profiles", {
          name: d.name,
          email: d.email.toLowerCase(),
          password_hash: hashPassword(d.password),
          role: d.role,
        });
        audit(user.id, "Usuário criado", id);
        return id;
      }
      case "password": {
        const d = mutationSchemas.password.parse(input);
        const record = one<{ password_hash: string }>(
          "SELECT password_hash FROM profiles WHERE id=?",
          user.id,
        );
        if (
          !record ||
          !verifyPassword(d.current_password, record.password_hash)
        )
          throw new Error("Senha atual incorreta.");
        run(
          "UPDATE profiles SET password_hash=? WHERE id=?",
          hashPassword(d.new_password),
          user.id,
        );
        audit(user.id, "Senha alterada", user.id);
        break;
      }
      case "components": {
        const d = mutationSchemas.components.parse(input);
        exists("products", d.product_id);
        if (
          new Set(d.components.map((c) => c.inventory_id)).size !==
          d.components.length
        )
          throw new Error("Não repita o mesmo material na composição.");
        d.components.forEach((c) => exists("inventory_items", c.inventory_id));
        run("DELETE FROM product_components WHERE product_id=?", d.product_id);
        d.components.forEach((c) =>
          insert("product_components", { product_id: d.product_id, ...c }),
        );
        audit(user.id, "Composição de produto alterada", d.product_id);
        break;
      }
      case "inventory": {
        const d = mutationSchemas.inventory.parse(input);
        const id = z.object({ id: uuid.optional() }).parse(input).id;
        if (id) {
          exists("inventory_items", id);
          run(
            "UPDATE inventory_items SET name=?,unit=?,minimum=?,cost=?,supplier=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
            d.name,
            d.unit,
            d.minimum,
            d.cost,
            d.supplier,
            id,
          );
          audit(user.id, "Material alterado", id);
          return id;
        }
        const created = insert("inventory_items", d);
        audit(user.id, "Material criado", created);
        return created;
      }
      case "weights": {
        const d = mutationSchemas.weights.parse(input);
        run(
          "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          "score_weights",
          JSON.stringify(d),
        );
        audit(user.id, "Pesos do score alterados", "score_weights");
        break;
      }
      default:
        throw new Error("Ação não reconhecida.");
    }
    return true;
  });
}
