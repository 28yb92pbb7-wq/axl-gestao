"use client";
import { Check, ShoppingBag, Wallet, ChartNoAxesCombined } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { money, dateBR } from "@/lib/domain";
import type { Sale, State } from "@/lib/types";

import { Empty } from "../ui";
import { Metric, PanelHeading } from "./shared";
const colors = ["#168254", "#56b18a", "#9cd4b7", "#b7c7be", "#dbe8df"];
export default function DashboardView({
  page,
  state,
  total,
  paid,
  profit,
  start,
  end,
  selected,
  chart,
  segments,
}: {
  page: string;
  state: State;
  total: number;
  paid: number;
  profit: number;
  start: string;
  end: string;
  selected: Sale[];
  chart: { day: string; valor: number }[];
  segments: { name: string; value: number }[];
}) {
  return (
    <>
      {page === "Dashboard" && (
        <>
          <div className="metrics">
            <Metric
              label="Faturamento"
              value={money(total)}
              icon={<Wallet size={20} />}
              note={`${dateBR(start)} a ${dateBR(end)}`}
            />
            <Metric
              label="Recebido das vendas do período"
              value={money(paid)}
              icon={<Check size={20} />}
              note="Pagamentos recebidos, até agora"
            />
            <Metric
              label="Lucro bruto"
              value={money(profit)}
              icon={<ChartNoAxesCombined size={20} />}
              note="Faturamento menos custos preservados"
            />
            <Metric
              label="Ticket médio"
              value={money(selected.length ? total / selected.length : 0)}
              icon={<ShoppingBag size={20} />}
              note={`${selected.length} vendas · ${selected.reduce((s, v) => s + v.plates, 0)} placas`}
            />
          </div>
          <div className="dashboard-grid">
            <section className="panel chart-panel">
              <PanelHeading
                title="Faturamento por dia"
                subtitle="Acompanhe a evolução das suas vendas"
              />
              <div className="chart">
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={chart}>
                    <defs>
                      <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#188452"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#188452"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="#edf0ed" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => money(Number(v) * 100)} />
                    <Area
                      isAnimationActive={false}
                      type="monotone"
                      dataKey="valor"
                      stroke="#188452"
                      fill="url(#area)"
                      strokeWidth={3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {chart.length === 31 && (
                <small>
                  Gráfico mostra os primeiros 31 dias. Os indicadores usam todo
                  o período.
                </small>
              )}
            </section>
            <section className="panel chart-panel">
              <PanelHeading
                title="Faturamento por segmento"
                subtitle="Onde suas conexões geram resultado"
              />
              {segments.length ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={segments}
                        dataKey="value"
                        innerRadius={60}
                        outerRadius={90}
                      >
                        {segments.map((s, i) => (
                          <Cell key={s.name} fill={colors[i % colors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => money(Number(v) * 100)} />
                    </PieChart>
                  </ResponsiveContainer>
                  {segments.map((s, i) => (
                    <div className="legend" key={s.name}>
                      <i style={{ background: colors[i % colors.length] }} />
                      {s.name}
                      <strong>{money(s.value * 100)}</strong>
                    </div>
                  ))}
                </>
              ) : (
                <Empty text="Registre uma venda para visualizar os segmentos." />
              )}
            </section>
          </div>
          <div className="metrics compact">
            <Metric
              label="A receber no período"
              value={money(total - paid)}
              note="Faturamento ainda não recebido"
            />
            <Metric
              label="Clientes recorrentes"
              value={String(
                state.companies.filter(
                  (c) =>
                    state.sales.filter((s) => s.company_id === c.id).length > 1,
                ).length,
              )}
              note="Clientes com mais de uma compra"
            />
            <Metric
              label="Conversão acumulada"
              value={`${state.companies.length ? Math.round((state.companies.filter((c) => c.is_customer).length / state.companies.length) * 100) : 0}%`}
              note="Clientes / empresas cadastradas"
            />
            <Metric
              label="Comissões do período"
              value={money(selected.reduce((s, v) => s + v.commission, 0))}
              note="Regra preservada na venda"
            />
          </div>
        </>
      )}
    </>
  );
}
