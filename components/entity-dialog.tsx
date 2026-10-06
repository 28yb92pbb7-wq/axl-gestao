"use client";
import { useState } from "react";
import type { State } from "@/lib/types";
import { money, today, orderStages, dateBR } from "@/lib/domain";
import { ActionForm, Dialog, type Mutate } from "./ui";
import SaleForm from "./sale-form";
import CompanyDetail from "./company-detail";
import CompositionForm from "./composition-form";
import { Metric } from "./views/shared";
import { companyFields, productFields } from "./form-fields";
export type Modal = { kind: string; id?: string; companyId?: string };
export default function EntityDialog({
  modal,
  state,
  mutate,
  setModal,
  form,
}: {
  modal: Modal;
  state: State;
  mutate: Mutate;
  setModal: (modal: Modal | undefined) => void;
  form: (kind: string, id?: string, companyId?: string) => void;
}) {
  const day = today();
  const chosenCompany = state.companies.find((c) => c.id === modal.id);
  const chosenProduct = state.products.find((p) => p.id === modal.id);
  return (
    <Dialog
      title={
        (
          {
            company: "Cadastro de cliente",
            lead: "Cadastro de lead",
            product: "Produto AXL",
            sale: "Registrar venda",
            detail: "Ficha da empresa",
            "sale-detail": "Detalhes da venda",
            order: "Atualizar pedido",
            payment: "Registrar pagamento",
            expense: "Cadastrar despesa",
            stock: "Movimentação de estoque",
            purchase: "Compra de material",
            goal: "Editar meta",
            seller: "Cadastrar vendedor",
            route: "Criar rota de visitas",
            lost: "Motivo de perda",
          } as Record<string, string>
        )[modal.kind] || "AXL"
      }
      close={() => setModal(undefined)}
    >
      {["company", "lead"].includes(modal.kind) && (
        <ActionForm
          action="company"
          mutate={mutate}
          close={() => setModal(undefined)}
          extra={{
            id: modal.id,
            is_customer: chosenCompany
              ? !!chosenCompany.is_customer
              : modal.kind === "company",
            is_lead: chosenCompany
              ? !!chosenCompany.is_lead
              : modal.kind === "lead",
            salesperson_id: chosenCompany?.salesperson_id || null,
            place_id: chosenCompany?.place_id || null,
          }}
          fields={companyFields(chosenCompany, state)}
        />
      )}
      {modal.kind === "product" && (
        <ActionForm
          action="product"
          mutate={mutate}
          close={() => setModal(undefined)}
          extra={{ id: modal.id }}
          fields={productFields(chosenProduct)}
        />
      )}
      {modal.kind === "product" && chosenProduct && (
        <section className="inline-form">
          <h3>Composição e simulador de custo</h3>
          <CompositionForm
            product={chosenProduct}
            state={state}
            mutate={mutate}
          />
        </section>
      )}
      {modal.kind === "inventory" && (
        <ActionForm
          action="inventory"
          mutate={mutate}
          close={() => setModal(undefined)}
          extra={{ id: modal.id }}
          fields={[
            {
              name: "name",
              label: "Material",
              value: state.inventory.find((i) => i.id === modal.id)?.name,
              required: true,
            },
            {
              name: "unit",
              label: "Unidade",
              value:
                state.inventory.find((i) => i.id === modal.id)?.unit || "un",
              required: true,
            },
            {
              name: "minimum",
              label: "Estoque mínimo",
              type: "number",
              value:
                state.inventory.find((i) => i.id === modal.id)?.minimum || 0,
              required: true,
            },
            {
              name: "cost",
              label: "Custo médio (R$)",
              type: "money",
              value: state.inventory.find((i) => i.id === modal.id)?.cost || 0,
              required: true,
            },
            {
              name: "supplier",
              label: "Fornecedor",
              value:
                state.inventory.find((i) => i.id === modal.id)?.supplier || "",
            },
          ]}
        />
      )}
      {modal.kind === "sale" && (
        <SaleForm
          state={state}
          mutate={mutate}
          close={() => setModal(undefined)}
          companyId={modal.companyId}
        />
      )}
      {modal.kind === "detail" && chosenCompany && (
        <CompanyDetail
          company={chosenCompany}
          state={state}
          mutate={mutate}
          edit={() =>
            form(
              chosenCompany.is_customer ? "company" : "lead",
              chosenCompany.id,
            )
          }
          sell={() => form("sale", undefined, chosenCompany.id)}
        />
      )}
      {modal.kind === "sale-detail" &&
        (() => {
          const s = state.sales.find((s) => s.id === modal.id);
          return (
            s && (
              <>
                <h2>
                  Venda #{s.number} · {s.company_name}
                </h2>
                <div className="metrics compact">
                  <Metric label="Total" value={money(s.total)} />
                  <Metric label="Custo preservado" value={money(s.cost)} />
                  <Metric label="Lucro" value={money(s.profit)} />
                  <Metric label="Comissão" value={money(s.commission)} />
                </div>
                <p>
                  {dateBR(s.date)} · {s.method} · {s.plates} placas
                </p>
                <p>
                  Recebido: {money(s.paid)} · Saldo: {money(s.total - s.paid)}
                </p>
                <p>{s.notes || "Sem observações."}</p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Qtd.</th>
                        <th>Preço unitário</th>
                        <th>Custo histórico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.saleItems
                        .filter((i) => i.sale_id === s.id)
                        .map((i) => (
                          <tr key={i.id}>
                            <td>{i.product_name}</td>
                            <td>{i.quantity}</td>
                            <td>{money(i.price)}</td>
                            <td>{money(i.cost)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p className="notice">
                  Snapshot da comissão: {s.commission_rule}. Alterações no
                  catálogo não alteram esta venda.
                </p>
                <button
                  className="primary"
                  disabled={s.paid >= s.total}
                  onClick={() => form("payment", s.id)}
                >
                  Registrar pagamento
                </button>
              </>
            )
          );
        })()}
      {modal.kind === "order" &&
        (() => {
          const o = state.orders.find((o) => o.id === modal.id);
          return (
            o && (
              <ActionForm
                action="order"
                mutate={mutate}
                close={() => setModal(undefined)}
                extra={{ id: o.id }}
                fields={[
                  {
                    name: "status",
                    label: "Status",
                    type: "select",
                    value: o.status,
                    options: orderStages.map((v) => ({
                      value: v,
                      label: v,
                    })),
                  },
                  {
                    name: "promised_date",
                    label: "Entrega prometida",
                    type: "date",
                    value: o.promised_date,
                  },
                  {
                    name: "notes",
                    label: "Observações",
                    type: "textarea",
                    value: o.notes,
                  },
                ]}
              />
            )
          );
        })()}
      {modal.kind === "payment" &&
        (() => {
          const s = state.sales.find((s) => s.id === modal.id);
          return (
            s && (
              <>
                <p>
                  Venda #{s.number} · {s.company_name} · Saldo:{" "}
                  {money(s.total - s.paid)}
                </p>
                <ActionForm
                  action="payment"
                  mutate={mutate}
                  close={() => setModal(undefined)}
                  extra={{ sale_id: s.id }}
                  fields={[
                    {
                      name: "amount",
                      label: "Valor recebido (R$)",
                      type: "money",
                      value: s.total - s.paid,
                      required: true,
                    },
                    {
                      name: "method",
                      label: "Forma de pagamento",
                      type: "select",
                      options: [
                        "Pix",
                        "Dinheiro",
                        "Cartão",
                        "Boleto",
                        "Transferência",
                        "Outro",
                      ].map((v) => ({ value: v, label: v })),
                    },
                    {
                      name: "date",
                      label: "Data",
                      type: "date",
                      value: day,
                      required: true,
                    },
                  ]}
                />
              </>
            )
          );
        })()}
      {modal.kind === "expense" && (
        <ActionForm
          action="expense"
          mutate={mutate}
          close={() => setModal(undefined)}
          fields={[
            { name: "description", label: "Descrição", required: true },
            {
              name: "category",
              label: "Categoria",
              type: "select",
              options: [
                "Acrílico",
                "NFC",
                "Impressão",
                "Combustível",
                "Estacionamento",
                "Frete",
                "Anúncios",
                "Software",
                "Comissão",
                "Embalagem",
                "Telefone",
                "Outros",
              ].map((v) => ({ value: v, label: v })),
            },
            {
              name: "amount",
              label: "Valor (R$)",
              type: "money",
              required: true,
            },
            {
              name: "date",
              label: "Data",
              type: "date",
              value: day,
              required: true,
            },
            {
              name: "paid",
              label: "Despesa paga",
              type: "checkbox",
              value: true,
            },
          ]}
        />
      )}
      {modal.kind === "stock" && (
        <ActionForm
          action="stock"
          mutate={mutate}
          close={() => setModal(undefined)}
          extra={{ id: modal.id }}
          fields={[
            {
              name: "type",
              label: "Tipo",
              type: "select",
              options: ["Entrada", "Saída", "Ajuste", "Perda", "Devolução"].map(
                (v) => ({ value: v, label: v }),
              ),
            },
            {
              name: "quantity",
              label: "Quantidade (saída deve ser negativa)",
              type: "number",
              required: true,
            },
            {
              name: "description",
              label: "Motivo",
              type: "textarea",
              required: true,
            },
          ]}
        />
      )}
      {modal.kind === "purchase" && (
        <ActionForm
          action="purchase"
          mutate={mutate}
          close={() => setModal(undefined)}
          fields={[
            {
              name: "inventory_id",
              label: "Material",
              type: "select",
              options: state.inventory.map((i) => ({
                value: i.id,
                label: i.name,
              })),
            },
            { name: "supplier", label: "Fornecedor", required: true },
            {
              name: "quantity",
              label: "Quantidade",
              type: "number",
              required: true,
            },
            {
              name: "total",
              label: "Valor total (R$)",
              type: "money",
              required: true,
            },
            {
              name: "date",
              label: "Data da compra",
              type: "date",
              value: day,
              required: true,
            },
            {
              name: "paid",
              label: "Compra paga",
              type: "checkbox",
              value: true,
            },
          ]}
        />
      )}
      {modal.kind === "goal" && (
        <ActionForm
          action="goal"
          mutate={mutate}
          close={() => setModal(undefined)}
          extra={{ id: modal.id }}
          fields={[
            {
              name: "amount",
              label: "Meta (R$)",
              type: "money",
              value: state.goals.find((g) => g.id === modal.id)?.amount,
              required: true,
            },
          ]}
        />
      )}
      {modal.kind === "seller" && (
        <ActionForm
          action="seller"
          mutate={mutate}
          close={() => setModal(undefined)}
          fields={[
            { name: "name", label: "Nome", required: true },
            { name: "email", label: "E-mail", type: "email" },
            { name: "city", label: "Cidade" },
            {
              name: "commission_type",
              label: "Modelo de comissão",
              type: "select",
              options: [
                { value: "percent", label: "Percentual da venda" },
                { value: "margin", label: "Percentual do lucro" },
                { value: "plate", label: "Valor em centavos por placa" },
              ],
            },
            {
              name: "commission_value",
              label: "Percentual ou centavos por placa",
              type: "number",
              value: 5,
              required: true,
            },
          ]}
        />
      )}
      {modal.kind === "route" && (
        <RouteForm
          state={state}
          save={async (data) => {
            await mutate("route", data);
            setModal(undefined);
          }}
        />
      )}
      {modal.kind === "lost" && (
        <ActionForm
          action="stage"
          mutate={mutate}
          close={() => setModal(undefined)}
          extra={{ id: modal.id, status: "Perdido" }}
          fields={[
            {
              name: "reason",
              label: "Por que a oportunidade foi perdida?",
              type: "textarea",
              required: true,
            },
          ]}
        />
      )}
    </Dialog>
  );
}
function RouteForm({
  state,
  save,
}: {
  state: State;
  save: (data: unknown) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const form = new FormData(e.currentTarget);
        try {
          await save({
            name: form.get("name"),
            date: form.get("date"),
            salesperson_id: form.get("salesperson_id") || null,
            companies: selected,
          });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Erro ao criar rota.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Nome da rota
          <input name="name" required placeholder="Valinhos · Centro" />
        </label>
        <label>
          Data
          <input name="date" type="date" required defaultValue={today()} />
        </label>
        <label>
          Vendedor
          <select name="salesperson_id">
            <option value="">Equipe AXL</option>
            {state.salespeople.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h3>Selecione na ordem de visita</h3>
      {state.companies.map((c) => (
        <label className="route-choice" key={c.id}>
          <input
            type="checkbox"
            checked={selected.includes(c.id)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, c.id]
                  : selected.filter((v) => v !== c.id),
              )
            }
          />
          {selected.includes(c.id) ? selected.indexOf(c.id) + 1 + ". " : ""}
          {c.name} · {c.city}
        </label>
      ))}
      {error && <p className="notice error">{error}</p>}
      <footer>
        <button className="primary" disabled={busy || !selected.length}>
          {busy ? "Salvando…" : "Criar rota"}
        </button>
      </footer>
    </form>
  );
}
