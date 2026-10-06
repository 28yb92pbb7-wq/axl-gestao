"use client";
import { paymentKnown } from "@/lib/history";
import {
  ArrowUpRight,
  ArrowRight,
  Bell,
  Check,
  ClipboardList,
  Map,
  Radio,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";

import { money, dateBR } from "@/lib/domain";
import type { Company, Sale, Followup, Inventory, State } from "@/lib/types";

import { Badge, Empty, type Mutate } from "../ui";
import { Metric, PanelHeading } from "./shared";
export default function CentralView({
  page,
  state,
  revenue,
  todaySales,
  day,
  totalBalance,
  opportunities,
  pending,
  inventoryLow,
  go,
  form,
  mutate,
  setError,
}: {
  page: string;
  state: State;
  revenue: number;
  goal: number;
  todaySales: Sale[];
  day: string;
  totalBalance: number;
  opportunities: (Company & { score: number })[];
  pending: Followup[];
  inventoryLow: Inventory[];
  go: (page: string) => void;
  form: (kind: string, id?: string, companyId?: string) => void;
  mutate: Mutate;
  setError: (error: string) => void;
}) {
  return (
    <>
      {page === "Central do Dia" && (
        <>
          <section className="daily-hero">
            <div>
              <span className="eyebrow">UM NOVO DIA, NOVAS CONEXÕES</span>
              <h2>
                Sua próxima conquista
                <br />
                começa aqui.
              </h2>
              <p>Acompanhe suas metas e foque no que faz a AXL crescer.</p>
              <button onClick={() => go("Leads")}>
                Explorar oportunidades <ArrowRight size={17} />
              </button>
            </div>
            <div className="daily-goal">
              <h3>Fechou uma venda?</h3>
              <p>
                Nome, solução, quantidade e valor. Complete os demais dados
                depois.
              </p>
              <button className="primary" onClick={() => form("quick-sale")}>
                Registrar venda rápida
              </button>
            </div>
            <div className="hero-art">
              <Radio size={120} />
            </div>
          </section>
          <div className="metrics">
            <Metric
              onClick={() => go("Vendas")}
              label="Faturamento de hoje"
              value={money(revenue)}
              icon={<Wallet size={20} />}
              note="Vendas registradas no dia"
            />
            <Metric
              onClick={() => go("Vendas")}
              label="Vendas realizadas"
              value={String(todaySales.length)}
              icon={<ShoppingBag size={20} />}
              note={`${todaySales.reduce((s, v) => s + v.plates, 0)} placas vendidas hoje`}
            />
            <Metric
              onClick={() => go("Leads")}
              label="Novos leads"
              value={String(
                state.companies.filter(
                  (c) => !c.is_customer && c.created_at.slice(0, 10) === day,
                ).length,
              )}
              icon={<Users size={20} />}
              note="Novas conexões para explorar"
            />
            <Metric
              onClick={() => go("Financeiro")}
              label="A receber"
              value={money(totalBalance)}
              icon={<ClipboardList size={20} />}
              note={`${state.sales.filter((s) => paymentKnown(s) && s.paid < s.total).length} vendas com saldo pendente`}
            />
          </div>
          <div className="dashboard-grid">
            <section className="panel opportunities">
              <PanelHeading
                title="Melhores oportunidades"
                subtitle="Os contatos com maior potencial para a AXL"
                action={() => go("Leads")}
              />
              {opportunities.slice(0, 4).map((c, index) => (
                <button
                  className="opportunity-row"
                  key={c.id}
                  onClick={() => form("detail", c.id)}
                >
                  <span className="rank">0{index + 1}</span>
                  <span className="avatar colored">
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="company-label">
                    <strong>{c.name}</strong>
                    <small>
                      {c.segment} · {c.city}
                    </small>
                  </span>
                  <span className="score-label">
                    <strong>{c.score}</strong>
                    <small>Score parcial</small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))}
              {!opportunities.length && (
                <Empty text="Cadastre leads para descobrir oportunidades." />
              )}
              <div className="panel-foot">
                <Sparkles size={15} />
                Priorização com base nos seus dados comerciais.
              </div>
            </section>
            <section className="panel">
              <PanelHeading
                title="Retornos para hoje"
                subtitle={`${pending.length} contatos esperando por você`}
                action={() => go("Leads")}
              />
              {pending.slice(0, 4).map((f) => (
                <div className="followup-row" key={f.id}>
                  <span className="time-tag">{f.date.slice(11, 16)}</span>
                  <button
                    className="text-button"
                    onClick={() => form("detail", f.company_id)}
                  >
                    <strong>{f.company_name}</strong>
                    <small>{f.reason}</small>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Concluir retorno ${f.company_name}`}
                    onClick={() =>
                      mutate("followup_done", { id: f.id }).catch((e) =>
                        setError(e.message),
                      )
                    }
                  >
                    <Check size={16} />
                  </button>
                  {f.date.slice(0, 10) < day && (
                    <Badge tone="amber">Vencido</Badge>
                  )}
                </div>
              ))}
              {!pending.length && (
                <Empty text="Nenhum retorno pendente para hoje." />
              )}
              <div className="panel-foot">
                <Bell size={15} />
                Horários de Brasília · Retornos vencidos incluídos.
              </div>
            </section>
          </div>
          <div className="section-title">
            <h2>Operação em movimento</h2>
            <span>Um olhar rápido para o que precisa de você</span>
          </div>
          <div className="operation-grid">
            {[
              [
                "Arte pendente",
                state.orders.filter((o) => o.status === "Arte pendente").length,
                "Pedidos",
              ],
              [
                "Em produção",
                state.orders.filter((o) => o.status === "Produção").length,
                "Produção",
              ],
              [
                "Prontos para entrega",
                state.orders.filter((o) => o.status === "Pronto para entrega")
                  .length,
                "Pedidos",
              ],
              ["Estoque baixo", inventoryLow.length, "Estoque"],
            ].map(([label, count, target]) => (
              <button
                key={label}
                className="panel operation"
                onClick={() => go(String(target))}
              >
                <span>{label}</span>
                <strong>{count}</strong>
                <ArrowUpRight size={18} />
              </button>
            ))}
          </div>
          <section className="panel route-suggestion">
            <Map size={26} />
            <div>
              <h3>Sua próxima rota</h3>
              <p>
                {state.routes.length
                  ? `${state.routes[0].name} · ${dateBR(state.routes[0].date)}`
                  : "Selecione empresas e organize suas visitas presenciais."}
              </p>
            </div>
            <button className="secondary" onClick={() => go("Mapa / Rotas")}>
              Planejar visitas
              <ArrowRight size={15} />
            </button>
          </section>
        </>
      )}
    </>
  );
}
