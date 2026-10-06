"use client";
import { useState } from "react";
import { paymentKnown } from "@/lib/history";
import { financeSummary } from "@/lib/finance";
import { money, dateBR } from "@/lib/domain";
import type { State, Sale } from "@/lib/types";
import { Table, Dialog } from "../ui";
import { Metric } from "./shared";
export default function FinanceView({
  page,
  state,
  form,
  filteredSales,
}: {
  page: string;
  state: State;
  totalBalance: number;
  filteredSales?: Sale[];
  form: (kind: string, id?: string, companyId?: string) => void;
}) {
  const [drill, setDrill] = useState("");
  if (page !== "Financeiro") return null;
  const scoped = filteredSales
    ? {
        ...state,
        sales: filteredSales,
        payments: state.payments.filter((p) =>
          filteredSales.some((s) => s.id === p.sale_id),
        ),
      }
    : state;
  const f = financeSummary(scoped);
  const global = financeSummary(state);
  const rows = (filteredSales || state.sales).filter((s) =>
    drill === "Situação desconhecida"
      ? !paymentKnown(s)
      : drill === "A receber"
        ? paymentKnown(s) && s.paid < s.total
        : true,
  );
  return (
    <>
      <div className="metrics">
        <Metric
          label="Faturamento"
          value={money(f.revenue)}
          onClick={() => setDrill("Faturamento")}
        />
        <Metric
          label="Recebimentos confirmados"
          value={money(f.confirmed)}
          onClick={() => setDrill("Recebimentos confirmados")}
        />
        <Metric
          label="A receber confirmado"
          value={money(f.balance)}
          onClick={() => setDrill("A receber")}
        />
        <Metric
          label="Situação desconhecida"
          value={money(f.unknown)}
          onClick={() => setDrill("Situação desconhecida")}
        />
        <Metric
          label="Resultado bruto parcial / estimado"
          value={f.grossKnown ? money(f.gross) : "Não informado"}
          note="Custos materiais consumidos nas vendas; compras de estoque não são deduzidas outra vez."
          onClick={() => setDrill("Resultado parcial")}
        />
        <Metric
          label="Investimento em estoque pago"
          value={money(global.investment)}
          note="Toda a AXL, após o saldo inicial"
          onClick={() => setDrill("Investimento em estoque")}
        />
        <Metric
          label="Caixa calculado após conferência"
          value={global.cash === null ? "A conferir" : money(global.cash)}
          note={
            global.opening
              ? "Saldo inicial + movimentos confirmados a partir de " +
                dateBR(global.opening!.date)
              : "Informe um saldo inicial conferido para calcular o caixa."
          }
          onClick={() => setDrill("Caixa")}
        />
      </div>
      <p className="notice">
        Filtros de cidade, segmento, responsável e período aplicam-se às vendas.
        Caixa, compras e despesas abrangem toda a AXL. Pagamentos ausentes não
        são tratados como recebidos ou pendentes. Resultado é parcial quando
        faltam custos e estimado quando usa NFC provisório. Saldo inicial
        considera os movimentos da própria data; escolha o início do dia e
        confira os lançamentos. Compra de material é investimento em estoque,
        consumo é custo da venda: evite registrar a mesma compra também como
        despesa.
      </p>
      <button className="primary" onClick={() => form("cash_entry")}>
        Saldo inicial / aporte / retirada
      </button>
      <h2>Vendas para conferência</h2>
      <Table
        rows={(filteredSales || state.sales).filter(
          (s) => !paymentKnown(s) || s.paid < s.total,
        )}
        columns={[
          { key: "company_name", label: "Empresa" },
          { key: "total", label: "Total", render: (s) => money(s.total) },
          {
            key: "paid",
            label: "Situação",
            render: (s) =>
              paymentKnown(s)
                ? `Recebido ${money(s.paid)} · saldo ${money(s.total - s.paid)}`
                : "Pagamento não informado",
          },
          {
            key: "id",
            label: "Ação",
            render: (s) => (
              <button
                className="secondary"
                onClick={() => form("payment_set", s.id)}
              >
                Conferir pagamento
              </button>
            ),
          },
        ]}
      />
      <h2>Despesas operacionais</h2>
      <Table
        rows={state.expenses}
        columns={[
          { key: "description", label: "Descrição" },
          { key: "category", label: "Categoria" },
          { key: "amount", label: "Valor", render: (e) => money(e.amount) },
          { key: "date", label: "Data" },
          {
            key: "paid",
            label: "Pago",
            render: (e) => (e.paid ? "Confirmado" : "Pendente"),
          },
        ]}
      />
      {drill && (
        <Dialog title={drill} close={() => setDrill("")}>
          {drill === "Caixa" ? (
            <>
              <p>
                Saldo inicial:{" "}
                {global.opening
                  ? money(global.opening!.amount)
                  : "não informado"}{" "}
                · movimentos parciais: {money(global.partialFlow)}
              </p>
              <Table
                rows={state.cash || []}
                columns={[
                  { key: "type", label: "Tipo" },
                  {
                    key: "amount",
                    label: "Valor",
                    render: (c) => money(c.amount),
                  },
                  { key: "date", label: "Data" },
                  { key: "notes", label: "Conferência" },
                ]}
              />
              <Table
                rows={state.payments}
                columns={[
                  {
                    key: "sale_id",
                    label: "Venda",
                    render: (p) =>
                      state.sales.find((s) => s.id === p.sale_id)?.company_name,
                  },
                  {
                    key: "amount",
                    label: "Entrada",
                    render: (p) => money(p.amount),
                  },
                  { key: "date", label: "Data" },
                ]}
              />
            </>
          ) : drill === "Investimento em estoque" ? (
            <Table
              rows={state.lotPayments || []}
              columns={[
                {
                  key: "lot_id",
                  label: "Lote",
                  render: (p) =>
                    state.lots?.find((l) => l.id === p.lot_id)?.code,
                },
                {
                  key: "amount",
                  label: "Valor pago",
                  render: (p) => money(p.amount),
                },
                { key: "date", label: "Data" },
              ]}
            />
          ) : (
            <Table
              rows={rows}
              onRow={(s) => {
                setDrill("");
                form("sale-detail", s.id);
              }}
              columns={[
                { key: "company_name", label: "Empresa" },
                {
                  key: "total",
                  label: "Faturamento",
                  render: (s) => money(s.total),
                },
                {
                  key: "paid",
                  label: "Recebido",
                  render: (s) =>
                    paymentKnown(s) ? money(s.paid) : "Não informado",
                },
                {
                  key: "cost_status",
                  label: "Custo",
                  render: (s) => s.cost_status || "Histórico",
                },
              ]}
            />
          )}
        </Dialog>
      )}
    </>
  );
}
