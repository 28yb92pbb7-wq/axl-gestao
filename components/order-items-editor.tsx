"use client";
import { useState } from "react";
import type { State, Order } from "@/lib/types";
import type { Mutate } from "./ui";
export default function OrderItemsEditor({
  order,
  state,
  mutate,
}: {
  order: Order;
  state: State;
  mutate: Mutate;
}) {
  type Item = { product_id: string; quantity: number; from_stock?: boolean };
  const [items, setItems] = useState<Item[]>(() => {
    try {
      const x = JSON.parse(order.item_snapshot || "[]");
      return x.length
        ? x
        : state.saleItems
            .filter((i) => i.sale_id === order.sale_id)
            .map((i) => ({ product_id: i.product_id, quantity: i.quantity }));
    } catch {
      return [];
    }
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (order.produced_at)
    return <p>Produção confirmada: os itens consumidos ficam preservados.</p>;
  return (
    <section className="inline-form">
      <h3>Itens do pedido</h3>
      <p>
        Alterações liberam as reservas e mantêm a venda e seus custos
        históricos. Reserve novamente após revisar.
      </p>
      {items.map((i, n) => (
        <div className="form-grid" key={n}>
          <label>
            Produto físico
            <select
              value={i.product_id}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    n === j ? { ...x, product_id: e.target.value } : x,
                  ),
                )
              }
            >
              {state.products
                .filter((p) => p.kind !== "service")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              type="number"
              min="1"
              value={i.quantity}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    n === j ? { ...x, quantity: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </label>
          <label className="route-choice">
            <input
              type="checkbox"
              checked={!!i.from_stock}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    n === j ? { ...x, from_stock: e.target.checked } : x,
                  ),
                )
              }
            />
            Usar estoque de produto pronto vinculado
          </label>
          <button
            className="secondary"
            onClick={() => setItems(items.filter((_, j) => j !== n))}
          >
            Remover
          </button>
        </div>
      ))}
      <button
        className="secondary"
        onClick={() =>
          setItems([
            ...items,
            {
              product_id:
                state.products.find((p) => p.kind !== "service")?.id || "",
              quantity: 1,
            },
          ])
        }
      >
        Adicionar item físico
      </button>
      <button
        className="primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await mutate("order_items", {
              id: order.id,
              items: items.map((i) => ({
                product_id: i.product_id,
                quantity: i.quantity,
                from_stock: !!i.from_stock,
              })),
            });
            setError("Itens atualizados; reserve novamente.");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Salvar itens do pedido
      </button>
      {error && <p className="notice">{error}</p>}
    </section>
  );
}
