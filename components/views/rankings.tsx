"use client";

import { costKnown } from "@/lib/history";
import { money } from "@/lib/domain";
import type { Sale, State } from "@/lib/types";

import { Table } from "../ui";

export default function RankingsView({
  page,
  state,
  selected,
}: {
  page: string;
  state: State;
  selected: Sale[];
}) {
  return (
    <>
      {(page === "Relatórios" || page === "Inteligência AXL") && (
        <>
          <div className="notice">
            Rankings calculados sobre as vendas do período selecionado. O LTV
            usa todo o histórico do cliente.
          </div>
          <div className="rankings">
            {(["city", "segment", "company"] as const).map((group) => {
              const rows = Object.entries(
                selected.reduce<
                  Record<
                    string,
                    {
                      total: number;
                      profit: number;
                      known: number;
                      count: number;
                    }
                  >
                >((acc, s) => {
                  const company = state.companies.find(
                    (c) => c.id === s.company_id,
                  );
                  const name =
                    group === "city"
                      ? company?.city
                      : group === "segment"
                        ? company?.segment
                        : company?.name;
                  const key = name || "Outros";
                  acc[key] ??= { total: 0, profit: 0, known: 0, count: 0 };
                  acc[key].total += s.total;
                  if (costKnown(s)) {
                    acc[key].profit += s.profit;
                    acc[key].known++;
                  }
                  acc[key].count++;
                  return acc;
                }, {}),
              )
                .map(([name, v]) => ({
                  id: name,
                  name,
                  ...v,
                  profit_label: v.known
                    ? money(v.profit) + (v.known < v.count ? " (parcial)" : "")
                    : "Não informado",
                }))
                .sort((a, b) => b.total - a.total);
              return (
                <section key={group}>
                  <h2>
                    {group === "city"
                      ? "Cidades"
                      : group === "segment"
                        ? "Segmentos"
                        : "Clientes"}
                  </h2>
                  <Table
                    rows={rows}
                    filename={"ranking-" + group}
                    columns={[
                      { key: "name", label: "Nome" },
                      {
                        key: "total",
                        label: "Faturamento",
                        render: (r) => money(r.total),
                      },
                      {
                        key: "profit_label",
                        label: "Lucro",
                      },
                      { key: "count", label: "Vendas" },
                    ]}
                  />
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
