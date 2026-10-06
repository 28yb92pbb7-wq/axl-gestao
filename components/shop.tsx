"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { money, dateBR, today } from "@/lib/domain";
import type { User } from "@/lib/auth";
import type { ShopState, ShopOrder } from "@/lib/shop-service";
import type { State } from "@/lib/types";
import { type ShopListing } from "@/lib/shop-schema";
import MapsImportForm from "./maps-import-form";
import { Dialog } from "./ui";
const statuses: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  refused: "Recusado",
  suspended: "Suspenso",
};
export default function Shop({
  initial,
  user,
  mode,
}: {
  initial: ShopState;
  user?: User;
  mode: "catalog" | "account" | "admin";
}) {
  const [state, setState] = useState(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [cart, setCart] = useState<
      {
        product_id: string;
        quantity: number;
        option: string;
        personalization: Record<string, string>;
      }[]
    >(initial.cart || []),
    [selected, setSelected] = useState<ShopOrder>(),
    [internal, setInternal] = useState<State>(),
    [listing, setListing] = useState<ShopListing>(),
    [maps, setMaps] = useState<number | null>(null);
  useEffect(() => {
    if (user?.role !== "COMPRADOR" || mode !== "catalog") return;
    const timer = setTimeout(() => {
      fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cart", data: { items: cart } }),
      })
        .then(async (r) => {
          if (!r.ok) setError((await r.json()).error);
        })
        .catch(() =>
          setError(
            "Não foi possível salvar o carrinho. Sua compra não foi concluída.",
          ),
        );
    }, 600);
    return () => clearTimeout(timer);
  }, [cart, user?.role, mode]);
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [deliveryId, setDeliveryId] = useState("");
  const priceFor = (id: string, qty: number) => {
    const l = state.listings.find((l) => l.product_id === id);
    let p = l?.price || 0;
    for (const t of [...(l?.tiers || [])].sort((a, b) => a.minimum - b.minimum))
      if (qty >= t.minimum) p = t.price;
    return p;
  };
  const cartTotal =
    cart.reduce(
      (n, i) => n + priceFor(i.product_id, i.quantity) * i.quantity,
      0,
    ) + (state.settings.delivery.find((d) => d.id === deliveryId)?.fee || 0);
  async function refresh() {
    const r = await fetch("/api/shop", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setState(d);
    setSelected((prev) =>
      prev ? d.orders.find((o: ShopOrder) => o.id === prev.id) : undefined,
    );
  }
  useEffect(() => {
    if (mode === "admin")
      fetch("/api/data")
        .then((r) => r.json())
        .then(setInternal)
        .catch(() => setError("Não foi possível ler os produtos."));
  }, [mode]);
  async function act(action: string, data: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
      setNotice("Operação salva.");
      return d.result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(order: ShopOrder, kind: string, file: File) {
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.set("order_id", order.id);
      f.set("kind", kind);
      f.set("file", file);
      const r = await fetch("/api/shop/assets", { method: "POST", body: f });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await refresh();
      setNotice(
        kind === "proof"
          ? "Comprovante enviado. Recebimento ainda depende de conciliação."
          : "Arquivo enviado.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="shop-shell">
      <header className="shop-header">
        <Link href="/loja" className="brand">
          <strong>AXL NFC · Loja</strong>
        </Link>
        <nav>
          <Link href="/loja">Catálogo</Link>
          <Link href="/loja/conta">Minha conta / Meus pedidos</Link>
          {user?.role === "ADMIN" && (
            <>
              <Link href="/loja/admin">Administrar loja</Link>
              <Link href="/">Gestão</Link>
            </>
          )}
          {!user && <Link href="/login">Entrar</Link>}
        </nav>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {mode === "catalog" && (
        <>
          <h1>Placas para aproximar seu negócio</h1>
          <p>Cadastre-se e aguarde a aprovação para concluir compras.</p>
          {!state.listings.length && (
            <section className="panel settings-card">
              <h2>Catálogo em preparação</h2>
              <p>
                Os produtos aparecerão quando a AXL confirmar preços,
                disponibilidade e condições comerciais.
              </p>
            </section>
          )}
          <div className="shop-grid">
            {state.listings.map((l) => (
              <article className="panel settings-card" key={l.product_id}>
                {l.photo && (
                  <Image
                    unoptimized
                    width={400}
                    height={200}
                    src={l.photo}
                    alt={l.name}
                    style={{
                      maxWidth: "100%",
                      height: 200,
                      objectFit: "contain",
                    }}
                  />
                )}
                <h2>{l.name}</h2>
                <p>{l.description}</p>
                <strong>{money(l.price || 0)}</strong>
                {l.tiers.map((t) => (
                  <p key={t.minimum}>
                    A partir de {t.minimum} unidades: {money(t.price)} cada
                  </p>
                ))}
                <p>
                  {l.availability === "finished"
                    ? "Produto pronto, sujeito à disponibilidade confirmada"
                    : "Sob encomenda"}{" "}
                  · Produção: {l.production_days} dias
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    setCart([
                      ...cart,
                      {
                        product_id: l.product_id,
                        quantity: 1,
                        option: l.options[0] || "",
                        personalization: {},
                      },
                    ]);
                    setRequest(crypto.randomUUID());
                  }}
                >
                  Adicionar ao carrinho
                </button>
              </article>
            ))}
          </div>
          {cart.length > 0 && (
            <section className="panel settings-card">
              <h2>Carrinho</h2>
              <p>
                Itens e frete configurado: {money(cartTotal)}. Frete a orçar não
                permite concluir; preço final é revalidado pelo servidor.
              </p>
              {cart.map((i, index) => {
                const l = state.listings.find(
                  (l) => l.product_id === i.product_id,
                );
                return (
                  <div className="inline-form" key={index}>
                    <strong>
                      {l?.name || "Produto indisponível"} ·{" "}
                      {money(priceFor(i.product_id, i.quantity))} cada ·{" "}
                      {money(priceFor(i.product_id, i.quantity) * i.quantity)}{" "}
                      neste item
                    </strong>
                    <div className="form-grid">
                      <label>
                        Quantidade
                        <input
                          type="number"
                          min={1}
                          max={10000}
                          value={i.quantity}
                          onChange={(e) =>
                            setCart(
                              cart.map((x, n) =>
                                n === index
                                  ? { ...x, quantity: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      {!!l?.options.length && (
                        <label>
                          Modelo
                          <select
                            value={i.option}
                            onChange={(e) =>
                              setCart(
                                cart.map((x, n) =>
                                  n === index
                                    ? { ...x, option: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          >
                            {l.options.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setCart(cart.filter((_, n) => n !== index))
                      }
                    >
                      Remover
                    </button>
                  </div>
                );
              })}
              <p>
                Personalização e logo podem ser completados no pedido. A
                produção exige dados completos e sua aprovação da arte. Valores
                e disponibilidade serão recalculados no servidor.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const result = await act("checkout", {
                    request_id: request,
                    delivery_id: f.get("delivery_id"),
                    expected_total: cartTotal,
                    address: f.get("address") || "",
                    items: cart,
                  });
                  if (result) {
                    setCart([]);
                    setRequest(crypto.randomUUID());
                    setNotice(
                      `Pedido #${result.number} colocado. Aguardando pagamento.`,
                    );
                  }
                }}
              >
                <label>
                  Entrega
                  <select
                    name="delivery_id"
                    aria-label="Entrega"
                    required
                    value={deliveryId}
                    onChange={(e) => setDeliveryId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {state.settings.delivery.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label} ·{" "}
                        {d.fee === null ? "Frete a orçar" : money(d.fee)} ·{" "}
                        {d.area} ·{" "}
                        {d.transport_days === null
                          ? "prazo a confirmar"
                          : d.transport_days + " dias de transporte"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Endereço de entrega (quando necessário)
                  <textarea name="address" />
                </label>
                <p>{state.settings.purchase_policy}</p>
                <button
                  className="primary"
                  disabled={busy || state.account?.status !== "approved"}
                >
                  {state.account?.status === "approved"
                    ? "Concluir pedido — Pix manual"
                    : "Cadastro aprovado necessário para comprar"}
                </button>
                {!user && <Link href="/loja/cadastro">Criar conta</Link>}
              </form>
            </section>
          )}
        </>
      )}
      {mode === "account" && (
        <>
          <h1>Minha conta</h1>
          {state.account && (
            <>
              <h2>{state.account.name}</h2>
              <p>
                Cadastro: <strong>{statuses[state.account.status]}</strong>
              </p>
              {state.account.status === "pending" && (
                <p>Cadastro recebido. Aguarde a aprovação para comprar.</p>
              )}
              <details>
                <summary>Atualizar meus dados</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act("account", {
                      name: f.get("name"),
                      phone: f.get("phone"),
                      business: f.get("business"),
                    });
                  }}
                >
                  <label>
                    Nome
                    <input
                      name="name"
                      defaultValue={state.account.name}
                      required
                      minLength={2}
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      name="phone"
                      defaultValue={state.account.phone}
                      required
                    />
                  </label>
                  <label>
                    Estabelecimento (opcional)
                    <input
                      name="business"
                      defaultValue={state.account.business}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Salvar meus dados
                  </button>
                </form>
              </details>
            </>
          )}
          <h2>Meus pedidos</h2>
        </>
      )}
      {(mode === "account" || mode === "admin") && (
        <>
          {mode === "admin" && (
            <>
              <h1>Administração da loja</h1>
              <h2>Cadastros para análise</h2>
              {state.accounts.map((a) => (
                <section key={a.id} className="panel settings-card">
                  <strong>
                    {a.name} · {a.email}
                  </strong>
                  <p>
                    {a.phone} · {a.business} · {statuses[a.status]}
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      act("approval", {
                        id: a.id,
                        status: f.get("status"),
                        notes: f.get("notes") || "",
                      });
                    }}
                  >
                    <select name="status" defaultValue={a.status}>
                      {Object.entries(statuses).map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <label>
                      Observação interna
                      <textarea name="notes" />
                    </label>
                    <button className="primary" disabled={busy}>
                      Registrar decisão
                    </button>
                  </form>
                  <details>
                    <summary>
                      Associar a ficha histórica após verificar identidade
                    </summary>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        act("link_company", {
                          id: a.id,
                          company_id: f.get("company_id") || null,
                          notes: f.get("notes"),
                        });
                      }}
                    >
                      <select
                        name="company_id"
                        defaultValue={a.company_id || ""}
                      >
                        <option value="">Sem associação histórica</option>
                        {internal?.companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} · {c.city}
                          </option>
                        ))}
                      </select>
                      <label>
                        Como a identidade foi verificada
                        <textarea name="notes" required minLength={3} />
                      </label>
                      <button disabled={busy}>
                        Registrar associação verificada
                      </button>
                    </form>
                  </details>
                  {state.accountEvents
                    .filter((e) => e.buyer_id === a.id)
                    .map((e) => (
                      <p key={e.id}>
                        {dateBR(e.created_at)} · {statuses[e.status]} ·
                        administrador {e.admin_id} · {e.notes}
                      </p>
                    ))}
                </section>
              ))}
              <details className="panel settings-card">
                <summary>
                  Condições comerciais, atendimento, Pix e entrega
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    try {
                      const values = Object.fromEntries(f.entries());
                      act("settings", {
                        ...values,
                        payment_hours: f.get("payment_hours")
                          ? Number(f.get("payment_hours"))
                          : null,
                        delivery: JSON.parse(String(f.get("delivery") || "[]")),
                      });
                    } catch {
                      setError("Confira o JSON das modalidades de entrega.");
                    }
                  }}
                >
                  {(
                    [
                      "business_name",
                      "business_details",
                      "support",
                      "purchase_policy",
                      "privacy",
                      "cancellation_policy",
                      "pix_payload",
                      "payment_terms",
                    ] as const
                  ).map((k) => (
                    <label key={k}>
                      {
                        {
                          business_name: "Nome comercial",
                          business_details: "Dados reais da empresa",
                          support: "Canal de atendimento",
                          purchase_policy: "Condições de compra",
                          privacy: "Informações de privacidade",
                          cancellation_policy:
                            "Condições de alteração/cancelamento",
                          pix_payload:
                            "Chave ou payload Pix para pagamento à AXL",
                          payment_terms: "Instruções e condições de pagamento",
                        }[k]
                      }
                      <textarea name={k} defaultValue={state.settings[k]} />
                    </label>
                  ))}
                  <label>
                    Prazo para pagar (horas)
                    <input
                      name="payment_hours"
                      type="number"
                      min={1}
                      max={168}
                      defaultValue={state.settings.payment_hours ?? ""}
                    />
                  </label>
                  <label>
                    Modalidades de entrega (JSON)
                    <textarea
                      name="delivery"
                      rows={8}
                      defaultValue={JSON.stringify(
                        state.settings.delivery,
                        null,
                        2,
                      )}
                    />
                  </label>
                  <p>
                    Formato de cada modalidade: id, label, needs_address, fee
                    (centavos ou null para orçamento), area, transport_days.
                    Ex.: retirada deve ter local e prazo reais. Frete a orçar
                    impede checkout.
                  </p>
                  <button className="primary" disabled={busy}>
                    Salvar condições
                  </button>
                </form>
              </details>
              <h2>Produtos e rascunhos</h2>
              {internal?.products
                .filter((p) => p.kind !== "service")
                .map((p) => (
                  <button
                    key={p.id}
                    className="secondary"
                    onClick={() =>
                      setListing(
                        state.listings.find((l) => l.product_id === p.id) || {
                          product_id: p.id,
                          name: p.name,
                          published: false,
                          description: "",
                          photo: "",
                          price: null,
                          tiers: [],
                          quantity_available: null,
                          availability: "made_to_order",
                          production_days: null,
                          personalization: "google",
                          options: [],
                          components: [],
                        },
                      )
                    }
                  >
                    {p.name} ·{" "}
                    {state.listings.find((l) => l.product_id === p.id)
                      ?.published
                      ? "Publicado"
                      : "Rascunho"}
                  </button>
                ))}
              <h2>Pedidos da loja</h2>
              <p>
                Pedidos pendentes não entram no faturamento nem no recebido. A
                conciliação cria uma venda única e vincula a produção.
              </p>
            </>
          )}
          {!state.orders.length && <p>Nenhum pedido registrado.</p>}
          {state.orders.map((o) => (
            <button
              key={o.id}
              className="panel settings-card"
              onClick={() => setSelected(o)}
            >
              Pedido #{o.number} · {money(o.data.total)} · {o.status} ·
              Pagamento{" "}
              {o.payment_status === "confirmed"
                ? "conciliado"
                : o.payment_status === "refunded"
                  ? "estornado"
                  : "pendente"}
            </button>
          ))}
        </>
      )}
      <footer className="panel settings-card">
        <strong>{state.settings.business_name || "AXL"}</strong>
        <p>{state.settings.business_details}</p>
        <p>
          Atendimento: {state.settings.support || "Canal ainda não configurado"}
        </p>
        <details>
          <summary>Compra, cancelamento e privacidade</summary>
          <p>
            {state.settings.purchase_policy ||
              "Condições ainda não configuradas"}
          </p>
          <p>{state.settings.cancellation_policy}</p>
          <p>{state.settings.privacy}</p>
        </details>
      </footer>
      {listing && (
        <Dialog title="Produto da loja" close={() => setListing(undefined)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                act("listing", {
                  product_id: listing.product_id,
                  published: f.get("published") === "on",
                  description: f.get("description"),
                  photo: f.get("photo") || "",
                  price: f.get("price")
                    ? Math.round(Number(f.get("price")) * 100)
                    : null,
                  quantity_available: f.get("quantity_available")
                    ? Number(f.get("quantity_available"))
                    : null,
                  production_days: f.get("production_days")
                    ? Number(f.get("production_days"))
                    : null,
                  availability: f.get("availability"),
                  personalization: f.get("personalization"),
                  tiers: JSON.parse(String(f.get("tiers") || "[]")),
                  options: String(f.get("options") || "")
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  components: JSON.parse(String(f.get("components") || "[]")),
                });
              } catch {
                setError("Confira os valores e JSON dos preços/combos.");
              }
            }}
          >
            <h3>{listing.name}</h3>
            <label>
              Descrição
              <textarea name="description" defaultValue={listing.description} />
            </label>
            <label>
              Foto real disponível no projeto (caminho /... ou HTTPS autorizado)
              <input name="photo" defaultValue={listing.photo} />
            </label>
            <label>
              Preço oficial (R$)
              <input
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={listing.price === null ? "" : listing.price / 100}
              />
            </label>
            <label>
              Preços por quantidade (JSON em centavos)
              <textarea
                name="tiers"
                defaultValue={JSON.stringify(listing.tiers)}
              />
            </label>
            <label>
              Disponibilidade/capacidade total deste ciclo comercial
              <input
                name="quantity_available"
                type="number"
                min={0}
                defaultValue={listing.quantity_available ?? ""}
              />
            </label>
            <p>
              Pedidos pagos e reservas de pedidos não pagos dentro do prazo
              contam nessa capacidade. Ajuste o total do ciclo conforme
              capacidade real; material bruto não é placa pronta.
            </p>
            <label>
              Prazo de produção (dias)
              <input
                name="production_days"
                type="number"
                min={0}
                defaultValue={listing.production_days ?? ""}
              />
            </label>
            <label>
              Disponibilidade
              <select name="availability" defaultValue={listing.availability}>
                <option value="made_to_order">Sob encomenda</option>
                <option value="finished">
                  Produto pronto com estoque confirmado
                </option>
              </select>
            </label>
            <label>
              Personalização
              <select
                name="personalization"
                defaultValue={listing.personalization}
              >
                {[
                  "google",
                  "whatsapp",
                  "instagram",
                  "pix",
                  "table",
                  "combo",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label>
              Modelos (um por linha)
              <textarea
                name="options"
                defaultValue={listing.options.join("\n")}
              />
            </label>
            <label>
              Combo: IDs dos produtos e quantity (JSON)
              <textarea
                name="components"
                defaultValue={JSON.stringify(listing.components)}
              />
            </label>
            <p>
              {internal?.products.map((p) => `${p.name}: ${p.id}`).join(" · ")}
            </p>
            <label>
              <input
                name="published"
                type="checkbox"
                defaultChecked={listing.published}
              />
              Publicar após confirmar todas as condições
            </label>
            <button className="primary" disabled={busy}>
              Salvar produto
            </button>
          </form>
        </Dialog>
      )}
      {selected && (
        <Dialog
          title={`Pedido #${selected.number}`}
          close={() => setSelected(undefined)}
        >
          <p>
            {selected.status} · Pagamento {selected.payment_status} · Total{" "}
            {money(selected.data.total)}
          </p>
          <p>
            {selected.data.delivery.label} · {selected.data.address} · Frete{" "}
            {money(selected.data.delivery.fee)} · Transporte{" "}
            {selected.data.delivery.transport_days} dias ·{" "}
            {selected.data.tracking || "Sem rastreamento informado"}
          </p>
          {selected.payment_status === "pending" && (
            <>
              <p>Pagamento manual: {selected.data.pix_payload}</p>
              <p>
                {selected.data.payment_terms} · Prazo:{" "}
                {dateBR(selected.expires_at)}
              </p>
            </>
          )}
          {selected.data.items.map((item, index) => (
            <section className="inline-form" key={index}>
              <h3>
                {item.name} · {item.quantity} unidades · {money(item.total)}
              </h3>
              <p>Modelo: {item.option || "padrão"}</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act("personalization", {
                    id: selected.id,
                    index,
                    values: Object.fromEntries(
                      new FormData(e.currentTarget).entries(),
                    ),
                  });
                }}
              >
                {(
                  [
                    "phone",
                    "instagram",
                    "google_url",
                    "pix_payload",
                    "notes",
                  ] as const
                ).map((k) => (
                  <label key={k}>
                    {
                      {
                        phone: "WhatsApp de destino",
                        instagram: "Perfil Instagram",
                        google_url: "Link Google da empresa",
                        pix_payload:
                          "Payload Pix fornecido por você para a placa",
                        notes: "Detalhes da arte e do item",
                      }[k]
                    }
                    <input
                      name={k}
                      defaultValue={item.personalization[k] || ""}
                    />
                  </label>
                ))}
                <label>
                  <input
                    name="google_confirmed"
                    type="checkbox"
                    value="true"
                    defaultChecked={
                      item.personalization.google_confirmed === "true"
                    }
                  />
                  Confirmei a empresa do link Google
                </label>
                <button type="button" onClick={() => setMaps(index)}>
                  Identificar empresa pelo link Google
                </button>
                <p>
                  {item.missing?.length
                    ? "Pendente: " + item.missing.join(", ")
                    : "A arte será conferida pela AXL antes da aprovação."}
                </p>
                <button className="secondary" disabled={busy}>
                  Salvar personalização
                </button>
              </form>
            </section>
          ))}
          <h3>Arquivos e arte</h3>
          {selected.assets.map((a) => (
            <div key={a.id}>
              <a
                target="_blank"
                rel="noreferrer"
                href={`/api/shop/assets?id=${a.id}`}
              >
                {a.kind} · versão {a.version} · {a.filename}
              </a>
              {a.kind === "art" && user?.role === "COMPRADOR" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    act("art_approve", { id: selected.id, asset_id: a.id })
                  }
                >
                  Aprovar esta versão da arte
                </button>
              )}
            </div>
          ))}
          <p>
            {selected.data.art_approved
              ? "Arte aprovada pelo comprador"
              : "Arte ainda não aprovada pelo comprador"}
          </p>
          {(user?.role === "ADMIN"
            ? ["art", "logo", "proof"]
            : ["logo", "proof"]
          ).map((k) => (
            <label key={k}>
              Enviar{" "}
              {k === "art"
                ? "arte para aprovação"
                : k === "proof"
                  ? "comprovante (não confirma pagamento)"
                  : "logo"}{" "}
              · PNG/JPG/WebP/PDF, até 4 MB
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(selected, k, f);
                  e.target.value = "";
                }}
              />
            </label>
          ))}
          {mode === "admin" && (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  act("payment_confirm", {
                    id: selected.id,
                    date: f.get("date"),
                    confirmed: f.get("confirmed") === "on",
                  });
                }}
              >
                <label>
                  Data do recebimento integral
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                </label>
                <label>
                  <input name="confirmed" type="checkbox" required />
                  Conferi o recebimento real de {money(selected.data.total)}
                </label>
                <button
                  className="primary"
                  disabled={busy || selected.payment_status !== "pending"}
                >
                  Confirmar conciliação Pix
                </button>
              </form>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  act("delivery", {
                    id: selected.id,
                    tracking: new FormData(e.currentTarget).get("tracking"),
                  });
                }}
              >
                <label>
                  Rastreamento
                  <input
                    name="tracking"
                    defaultValue={selected.data.tracking || ""}
                  />
                </label>
                <button>Salvar rastreamento</button>
              </form>
              <Link href="/">Abrir gestão para produção e entrega</Link>
              {selected.payment_status === "confirmed" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act("refund", {
                      id: selected.id,
                      date: f.get("date"),
                      reason: f.get("reason"),
                      confirmed: f.get("confirmed") === "on",
                    });
                  }}
                >
                  <h3>Registrar estorno integral já realizado</h3>
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={today()}
                  />
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    placeholder="Motivo"
                  />
                  <label>
                    <input name="confirmed" type="checkbox" required />O
                    dinheiro já foi devolvido integralmente. Registrar saída de
                    caixa e cancelar sem restaurar consumo real.
                  </label>
                  <button disabled={busy}>Registrar estorno conciliado</button>
                </form>
              )}
            </>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              act(String(f.get("action")), {
                id: selected.id,
                reason: f.get("reason"),
              });
            }}
          >
            <label>
              Solicitar alteração/cancelamento conforme condições comerciais
              <textarea name="reason" required minLength={3} />
            </label>
            <select name="action">
              <option value="request_change">Solicitar alteração</option>
              <option value="request_cancel">Solicitar cancelamento</option>
              {mode === "admin" && (
                <option value="cancel">
                  Confirmar cancelamento de pedido não pago
                </option>
              )}
            </select>
            <button disabled={busy}>Registrar solicitação</button>
          </form>
          <h3>Andamento</h3>
          {selected.events.map((e) => (
            <p key={e.id}>
              {dateBR(e.created_at)} · {e.type}
            </p>
          ))}
        </Dialog>
      )}
      {maps !== null && selected && (
        <Dialog title="Link Google do seu item" close={() => setMaps(null)}>
          <MapsImportForm
            personalization
            onSelect={(v) => {
              const item = selected.data.items[maps];
              act("personalization", {
                id: selected.id,
                index: maps,
                values: {
                  ...item.personalization,
                  google_url: v.url,
                  google_confirmed: "true",
                },
              });
              setMaps(null);
            }}
          />
        </Dialog>
      )}
    </main>
  );
}
