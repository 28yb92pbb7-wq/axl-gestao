"use client";
import { useState } from "react";
import type { State } from "@/lib/types";
import { money, today } from "@/lib/domain";
import type { Mutate } from "./ui";
const cents = (v: FormDataEntryValue | null) =>
  v === null || String(v).trim() === ""
    ? null
    : Math.round(Number(String(v).replace(",", ".")) * 100);
export default function QuickSaleForm({
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
  const [requestId] = useState(() => crypto.randomUUID());
  const [company, setCompany] = useState(companyId || "");
  const [items, setItems] = useState([
    {
      product_id:
        state.products.find((p) => p.sku === "AXL-GOOGLE")?.id ||
        state.products[0]?.id ||
        "",
      quantity: 1,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [location, setLocation] = useState<{
    latitude: number;
    longitude: number;
  }>();
  const [payment, setPayment] = useState("unknown");
  const chosen = state.companies.find((c) => c.id === company);
  if (saved)
    return (
      <section>
        <h2>Venda registrada</h2>
        <p>
          O cliente e os itens foram salvos. Itens físicos geram pedido;
          serviços não geram produção.
        </p>
        <p>
          Você pode completar telefone, endereço e demais dados pela ficha da
          empresa.
        </p>
        <button className="primary" onClick={close}>
          Completar dados depois
        </button>
      </section>
    );
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          await mutate("quick_sale", {
            request_id: requestId,
            seller_lat: location?.latitude ?? null,
            seller_lng: location?.longitude ?? null,
            company_id: company || null,
            name: chosen?.name || f.get("name"),
            new_homonym: f.get("new_homonym") === "on",
            date: f.get("date"),
            total: cents(f.get("total")),
            payment_status: payment,
            paid: cents(f.get("paid")),
            method: f.get("method") || "Não informado",
            phone: f.get("phone") || "",
            contact: f.get("contact") || "",
            city: f.get("city") || "",
            notes: f.get("notes") || "",
            discount: cents(f.get("discount")) || 0,
            due_date: f.get("due_date") || null,
            items: items.map((item, i) => ({
              ...item,
              line_total: cents(f.get("line" + i)),
              service_cost: cents(f.get("cost" + i)),
              lot_id: f.get("lot" + i) || null,
              from_stock: f.get("stock" + i) === "on",
            })),
          });
          setSaved(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Erro ao salvar");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        Registre primeiro a venda. Os dados completos do cliente podem ficar
        para depois.
      </p>
      <div className="form-grid">
        <label>
          Empresa já cadastrada (opcional)
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">Novo estabelecimento</option>
            {state.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.city || "cidade não informada"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nome do estabelecimento
          <input
            name="name"
            required={!company}
            disabled={!!company}
            defaultValue={chosen?.name}
            placeholder="Nome comercial"
          />
        </label>
        <label>
          Data
          <input name="date" type="date" required defaultValue={today()} />
        </label>
        <label>
          Valor total da venda (R$)
          <input name="total" type="number" min="0.01" step="0.01" required />
        </label>
      </div>
      {!company && (
        <label className="route-choice">
          <input name="new_homonym" type="checkbox" />
          Se houver outro com o mesmo nome, criar uma ficha distinta
        </label>
      )}
      <h3>Soluções vendidas</h3>
      {items.map((item, i) => (
        <div className="inline-form" key={i}>
          <div className="form-grid">
            <label>
              Solução
              <select
                aria-label="Solução"
                value={item.product_id}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, product_id: e.target.value } : x,
                    ),
                  )
                }
              >
                {state.products
                  .filter((p) => p.active)
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
                required
                value={item.quantity}
                onChange={(e) =>
                  setItems(
                    items.map((x, j) =>
                      j === i ? { ...x, quantity: Number(e.target.value) } : x,
                    ),
                  )
                }
              />
            </label>
            <label>
              Valor deste item (R$, opcional)
              <input name={"line" + i} type="number" min="0" step="0.01" />
            </label>
            {state.products.find((p) => p.id === item.product_id)?.kind ===
            "service" ? (
              <label>
                Custo do serviço (R$, opcional)
                <input name={"cost" + i} type="number" min="0" step="0.01" />
              </label>
            ) : (
              <label>
                Lote de referência de custo (opcional)
                <select name={"lot" + i}>
                  <option value="">Composição atual</option>
                  {(state.lots || [])
                    .filter((l) =>
                      state.components.some(
                        (c) =>
                          c.product_id === item.product_id &&
                          c.inventory_id === l.inventory_id,
                      ),
                    )
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} · {money(l.unit_cost)}{" "}
                        {l.receipt_status === "historical_review"
                          ? "· histórico a revisar"
                          : ""}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          {state.products.find((p) => p.id === item.product_id)
            ?.stock_inventory_id && (
            <label className="route-choice">
              <input name={"stock" + i} type="checkbox" />
              Separar produto pronto (sem baixar componentes novamente)
            </label>
          )}
          {items.length > 1 && (
            <button
              type="button"
              className="text-button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
            >
              Remover item
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        className="secondary"
        onClick={() =>
          setItems([
            ...items,
            { product_id: state.products[0]?.id || "", quantity: 1 },
          ])
        }
      >
        Adicionar solução ao pacote
      </button>
      <p className="notice">
        Sem valores por item, o total fica no pacote. A receita não será
        dividida artificialmente entre placa e serviço. Custos ficam
        identificados como confirmados, estimados ou não informados.
      </p>
      <button
        type="button"
        className="text-button"
        onClick={() => {
          if (!navigator.geolocation) {
            setError("GPS indisponível; registre a venda normalmente.");
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (p) =>
              setLocation({
                latitude: p.coords.latitude,
                longitude: p.coords.longitude,
              }),
            () =>
              setError(
                "Localização não autorizada; registre a venda normalmente.",
              ),
          );
        }}
      >
        Adicionar minha localização à venda (opcional)
      </button>
      {location && (
        <p className="muted">
          Sua posição foi obtida com consentimento do navegador. Não é o
          endereço do cliente.
        </p>
      )}
      <details>
        <summary>Pagamento e dados adicionais</summary>
        <div className="form-grid">
          <label>
            Pagamento
            <select
              aria-label="Pagamento"
              value={payment}
              onChange={(e) => setPayment(e.target.value)}
            >
              <option value="unknown">Não informado</option>
              <option value="pending">Pendente confirmado</option>
              <option value="partial">Recebido parcialmente</option>
              <option value="received">Recebido integralmente</option>
            </select>
          </label>
          {payment === "partial" && (
            <label>
              Valor recebido (R$)
              <input
                name="paid"
                required
                type="number"
                min="0.01"
                step="0.01"
              />
            </label>
          )}
          <label>
            Forma de pagamento
            <input name="method" placeholder="Não informado" />
          </label>
          <label>
            Contato
            <input name="contact" />
          </label>
          <label>
            Telefone
            <input name="phone" type="tel" />
          </label>
          <label>
            Cidade
            <input name="city" />
          </label>
          <label>
            Desconto concedido (R$, já refletido no total)
            <input name="discount" type="number" min="0" step="0.01" />
          </label>
          <label>
            Vencimento combinado (opcional)
            <input name="due_date" type="date" />
          </label>
          <label>
            Observações
            <textarea name="notes" />
          </label>
        </div>
      </details>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button className="primary" disabled={busy || !items.length}>
          {busy ? "Salvando…" : "Registrar venda rápida"}
        </button>
      </footer>
    </form>
  );
}
