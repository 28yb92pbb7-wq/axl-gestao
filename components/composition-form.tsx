"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Product, State } from "@/lib/types";
import { money } from "@/lib/domain";
import type { Mutate } from "./ui";
export default function CompositionForm({
  product,
  state,
  mutate,
}: {
  product: Product;
  state: State;
  mutate: Mutate;
}) {
  const [items, setItems] = useState(
    state.components
      .filter((c) => c.product_id === product.id)
      .map((c) => ({ inventory_id: c.inventory_id, quantity: c.quantity })),
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cost = items.length
    ? Math.round(
        items.reduce(
          (s, c) =>
            s +
            c.quantity *
              (state.inventory.find((i) => i.id === c.inventory_id)?.cost || 0),
          0,
        ),
      )
    : product.cost;
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          !items.length &&
          !confirm(
            "Remover a composição? O produto passará a usar o custo padrão. Vendas anteriores serão preservadas.",
          )
        )
          return;
        setBusy(true);
        setError("");
        try {
          await mutate("components", {
            product_id: product.id,
            components: items,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao salvar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {items.map((item, index) => (
        <div className="sale-line" key={index}>
          <label>
            Material
            <select
              aria-label={`Material ${index + 1}`}
              value={item.inventory_id}
              onChange={(e) =>
                setItems(
                  items.map((i, n) =>
                    n === index ? { ...i, inventory_id: e.target.value } : i,
                  ),
                )
              }
            >
              {state.inventory.map((i) => (
                <option value={i.id} key={i.id}>
                  {i.name} · {money(i.cost)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              aria-label={`Quantidade material ${index + 1}`}
              type="number"
              min="0.001"
              step="0.001"
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
          <strong>
            {money(
              item.quantity *
                (state.inventory.find((i) => i.id === item.inventory_id)
                  ?.cost || 0),
            )}
          </strong>
          <button
            className="icon-button"
            type="button"
            aria-label="Remover componente"
            onClick={() => setItems(items.filter((_, n) => n !== index))}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        disabled={!state.inventory.length}
        onClick={() =>
          setItems([
            ...items,
            { inventory_id: state.inventory[0]?.id || "", quantity: 1 },
          ])
        }
      >
        <Plus size={15} />
        Adicionar componente
      </button>
      <div className="sale-total">
        <div>
          <small>Custo atual</small>
          <strong>{money(cost)}</strong>
        </div>
        <div>
          <small>Lucro no preço sugerido</small>
          {money(product.price - cost)}
        </div>
        <div>
          <small>Margem</small>
          {(product.price
            ? ((product.price - cost) / product.price) * 100
            : 0
          ).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
          %
        </div>
      </div>
      <p className="muted">
        Composição e custos são preservados por venda. O estoque só é baixado se
        “Controla estoque” estiver ativado no produto.
      </p>
      {error && <p className="notice error">{error}</p>}
      <footer>
        <button disabled={busy} className="primary">
          {busy ? "Salvando…" : "Salvar composição"}
        </button>
      </footer>
    </form>
  );
}
