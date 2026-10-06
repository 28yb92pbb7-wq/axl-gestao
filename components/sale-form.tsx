"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { calculateSale, money, today } from "@/lib/domain";
import type { State } from "@/lib/types";
import type { Mutate } from "./ui";
export default function SaleForm({
  state,
  mutate,
  close,
  companyId,
}: {
  state: State;
  mutate: Mutate;
  close: () => void;
  companyId?: string;
}) {
  const products = state.products.filter((p) => p.active);
  const [items, setItems] = useState([
    {
      product_id: products[0]?.id || "",
      quantity: 1,
      price: products[0]?.price || 0,
    },
  ]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const totals = calculateSale(
    items.map((i) => {
      const product = products.find((p) => p.id === i.product_id);
      const comps = state.components.filter(
        (c) => c.product_id === i.product_id,
      );
      return {
        ...i,
        cost: comps.length
          ? Math.round(
              comps.reduce(
                (s, c) =>
                  s +
                  c.quantity *
                    (state.inventory.find((v) => v.id === c.inventory_id)
                      ?.cost || 0),
                0,
              ),
            )
          : product?.cost || 0,
        is_plate: !!product?.is_plate,
      };
    }),
  );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(e.currentTarget);
        try {
          await mutate("sale", {
            company_id: form.get("company_id"),
            date: form.get("date"),
            salesperson_id: form.get("salesperson_id") || null,
            method: form.get("method"),
            due_date: form.get("due_date"),
            paid: Math.round(Number(form.get("paid")) * 100),
            notes: form.get("notes"),
            items,
          });
          close();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao registrar venda.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Cliente
          <select name="company_id" required defaultValue={companyId || ""}>
            <option value="">Selecione a empresa</option>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Data
          <input name="date" type="date" required defaultValue={today()} />
        </label>
        <label>
          Vendedor
          <select name="salesperson_id">
            <option value="">Sem vendedor</option>
            {state.salespeople.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pagamento
          <select name="method">
            {[
              "Pix",
              "Dinheiro",
              "Cartão",
              "Boleto",
              "Transferência",
              "Outro",
            ].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <h3>Itens da venda</h3>
      {items.map((item, index) => (
        <div className="sale-line" key={index}>
          <label>
            Produto
            <select
              required
              value={item.product_id}
              onChange={(e) =>
                setItems(
                  items.map((i, n) =>
                    n === index
                      ? {
                          ...i,
                          product_id: e.target.value,
                          price:
                            products.find((p) => p.id === e.target.value)
                              ?.price || 0,
                        }
                      : i,
                  ),
                )
              }
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              aria-label={`Quantidade item ${index + 1}`}
              type="number"
              min="1"
              step="1"
              value={item.quantity}
              onChange={(e) =>
                setItems(
                  items.map((i, n) =>
                    n === index
                      ? { ...i, quantity: Number(e.target.value) }
                      : i,
                  ),
                )
              }
            />
          </label>
          <label>
            Valor unitário (R$)
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.price / 100}
              onChange={(e) =>
                setItems(
                  items.map((i, n) =>
                    n === index
                      ? {
                          ...i,
                          price: Math.round(Number(e.target.value) * 100),
                        }
                      : i,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            disabled={items.length === 1}
            onClick={() => setItems(items.filter((_, n) => n !== index))}
            aria-label="Remover item"
          >
            <Trash2 size={18} />
          </button>
        </div>
      ))}
      <button
        className="secondary"
        type="button"
        onClick={() =>
          setItems([
            ...items,
            {
              product_id: products[0]?.id || "",
              quantity: 1,
              price: products[0]?.price || 0,
            },
          ])
        }
      >
        <Plus size={16} />
        Adicionar item
      </button>
      <div className="sale-total">
        <div>
          <small>Total da venda</small>
          <strong>{money(totals.total)}</strong>
        </div>
        <div>
          <small>Custo</small>
          {money(totals.cost)}
        </div>
        <div>
          <small>Lucro bruto</small>
          {money(totals.profit)}
        </div>
        <div>
          <small>Margem</small>
          {totals.margin.toLocaleString("pt-BR", {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
          %
        </div>
      </div>
      <div className="form-grid">
        <label>
          Recebido agora (R$)
          <input
            name="paid"
            type="number"
            min="0"
            max={totals.total / 100}
            step="0.01"
            defaultValue={0}
          />
        </label>
        <label>
          Vencimento do saldo
          <input name="due_date" type="date" defaultValue={today()} required />
        </label>
        <label className="span-2">
          Observações
          <textarea name="notes" rows={2} />
        </label>
      </div>
      <p className="muted">
        Um pedido será criado automaticamente. O saldo ficará em contas a
        receber.
      </p>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button type="button" className="secondary" onClick={close}>
          Cancelar
        </button>
        <button disabled={busy || !products.length} className="primary">
          {busy ? "Registrando…" : "Registrar venda"}
        </button>
      </footer>
    </form>
  );
}
