"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Radio,
  LayoutDashboard,
  Sun,
  Compass,
  Map,
  Users,
  UserRound,
  ShoppingBag,
  ClipboardList,
  Hammer,
  Package,
  Boxes,
  Wallet,
  Target,
  UsersRound,
  ChartNoAxesCombined,
  Sparkles,
  Settings,
  Search,
  Plus,
  Menu,
  X,
  LogOut,
  Check,
  RefreshCw,
  Bell,
  ChevronRight,
} from "lucide-react";

import { costKnown, paymentKnown, saleInPeriod } from "@/lib/history";
import { money } from "@/lib/domain";
import type { User } from "@/lib/auth";
import type { State } from "@/lib/types";
import { today, dateBR, opportunityScore } from "@/lib/domain";
import { Badge, Dialog, Table } from "./ui";
import EntityDialog, { type Modal } from "./entity-dialog";

import Prospecting from "./prospecting";

import CentralView from "./views/central";
import DashboardView from "./views/dashboard";
import CompaniesView from "./views/companies";
import CatalogView from "./views/catalog";
import OrdersView from "./views/orders";
import StockView from "./views/stock";
import FinanceView from "./views/finance";
import PlanningView from "./views/planning";
import RankingsView from "./views/rankings";
import RoutesView from "./views/routes";
import SettingsView from "./views/settings";

const navigation = [
  ["Central do Dia", Sun],
  ["Dashboard", LayoutDashboard],
  ["Prospecção", Compass],
  ["Visitas / Rotas", Map],
  ["Leads", Users],
  ["Clientes", UserRound],
  ["Vendas", ShoppingBag],
  ["Pedidos", ClipboardList],
  ["Produção", Hammer],
  ["Produtos", Package],
  ["Estoque", Boxes],
  ["Financeiro", Wallet],
  ["Metas", Target],
  ["Vendedores", UsersRound],
  ["Relatórios", ChartNoAxesCombined],
  ["Inteligência AXL", Sparkles],
  ["Configurações", Settings],
] as const;

export default function Workspace({
  user,
  initialState,
}: {
  user: User;
  initialState: State;
}) {
  const router = useRouter();
  const [page, setPage] = useState("Central do Dia");
  const [state, setState] = useState<State>(initialState);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<Modal>();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("");
  const [segmentFilter, setSegmentFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [drill, setDrill] = useState<{
    title: string;
    ids: string[];
    companies?: string[];
  }>();
  const [filter, setFilter] = useState("");
  const [period, setPeriod] = useState(
    initialState.sales.some((s) => s.import_source)
      ? "Todo o histórico"
      : "Este mês",
  );
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pipeline, setPipeline] = useState(true);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/data", { cache: "no-store" });
    if (response.status === 401) {
      router.push("/login");
      router.refresh();
      return;
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setState(data);
  }, [router]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function mutate(action: string, data: unknown) {
    if (action === "__refresh") {
      await refresh();
      return;
    }
    const response = await fetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, data }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await refresh();
    setToast("Salvo com sucesso.");
  }
  function go(value: string) {
    setPage(value);
    setFilter("");
    setMobile(false);
    setSearch("");
  }
  function form(kind: string, id?: string, companyId?: string) {
    setModal({ kind, id, companyId });
  }
  if (!state)
    return (
      <div className="loading">
        <Radio size={40} />
        <h2>AXL Gestão & Prospecção</h2>
        {error ? (
          <>
            <p className="error">{error}</p>
            <button
              className="primary"
              onClick={() => refresh().catch((e) => setError(e.message))}
            >
              Tentar novamente
            </button>
          </>
        ) : (
          <p>Preparando sua central…</p>
        )}
      </div>
    );
  const day = today();
  const now = new Date(day + "T12:00:00-03:00");
  const month = day.slice(0, 7);
  let start = day,
    end = day;
  if (period === "7 dias" || period === "30 dias") {
    const d = new Date(now);
    d.setDate(d.getDate() - (period === "7 dias" ? 6 : 29));
    start = d.toISOString().slice(0, 10);
  } else if (period === "Este mês") {
    start = month + "-01";
  } else if (period === "Mês anterior") {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    start = d.toISOString().slice(0, 10);
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    end = d.toISOString().slice(0, 10);
  } else if (period === "Este ano") {
    start = day.slice(0, 4) + "-01-01";
  } else if (period === "Personalizado") {
    start = from || day;
    end = to || day;
  }
  if (period === "Todo o histórico") {
    const knownDates = state.sales
      .flatMap((s) => [s.date, s.date_start, s.date_end])
      .filter((s): s is string => Boolean(s))
      .sort();
    start = knownDates[0] || day;
    end = knownDates.at(-1) || day;
  }
  const scopeCompany = (id: string) => {
    const c = state.companies.find((c) => c.id === id);
    return (
      !!c &&
      (!cityFilter || c.city === cityFilter) &&
      (!segmentFilter || (c.segment || "Outros") === segmentFilter) &&
      (!ownerFilter || c.salesperson_id === ownerFilter)
    );
  };
  const selected = state.sales.filter(
    (s) =>
      scopeCompany(s.company_id) &&
      saleInPeriod(s, start, end, period === "Todo o histórico"),
  );
  const todaySales = state.sales.filter((s) => s.date === day);
  const total = selected.reduce((s, v) => s + v.total, 0);
  const revenue = todaySales.reduce((s, v) => s + v.total, 0);
  const paid = selected.reduce((s, v) => s + v.paid, 0);
  const totalBalance = state.sales
    .filter(paymentKnown)
    .reduce((s, v) => s + v.total - v.paid, 0);
  const profit = selected.filter(costKnown).reduce((s, v) => s + v.profit, 0);
  const goal = state.goals.find((g) => g.period === "Diária")?.amount || 100000;
  const opportunities = state.companies
    .filter((c) => !c.is_customer && c.status !== "Perdido")
    .map((c) => ({
      ...c,
      score: opportunityScore(
        {
          phone: c.phone,
          segment: c.segment,
          contacted: state.activities.some(
            (a) =>
              a.company_id === c.id &&
              !["Cadastro", "Alteração"].includes(a.type),
          ),
        },
        state.weights,
      ).score,
    }))
    .sort((a, b) => b.score - a.score);
  const pending = state.followups.filter(
    (f) => !f.done && f.date.slice(0, 10) <= day,
  );
  const inventoryLow = state.inventory.filter(
    (i) => i.quantity_known !== 0 && i.quantity <= i.minimum,
  );
  const filteredCompanies = state.companies.filter(
    (c) =>
      (page === "Clientes" ? c.is_customer : c.is_lead) &&
      (filter ? c.status === filter : true) &&
      scopeCompany(c.id),
  );
  const chart = Array.from(
    {
      length: Math.min(
        31,
        Math.max(
          1,
          Math.floor(
            (new Date(end).getTime() - new Date(start).getTime()) / 86400000,
          ) + 1,
        ),
      ),
    },
    (_, n) => {
      const date = new Date(start + "T12:00:00Z");
      date.setDate(date.getDate() + n);
      const d = date.toISOString().slice(0, 10);
      return {
        day: d.slice(8) + "/" + d.slice(5, 7),
        valor: selected
          .filter((s) => s.date === d)
          .reduce((v, s) => v + s.total / 100, 0),
      };
    },
  );
  const segments = Object.entries(
    selected.reduce<Record<string, number>>((acc, s) => {
      const c = state.companies.find((c) => c.id === s.company_id);
      acc[c?.segment || "Outros"] =
        (acc[c?.segment || "Outros"] || 0) + s.total / 100;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value }));
  const searchCompanies = search
    ? state.companies.filter((c) =>
        [c.name, c.phone, c.city, c.document]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
    : [];
  const heading: Record<string, string> = {
    "Central do Dia": "Seu dia começa com boas oportunidades.",
    Dashboard: "Uma visão clara de cada conquista.",
    Clientes: "Relacionamentos que crescem com você.",
    Leads: "Transforme contatos em novas conexões.",
    Vendas: "Cada venda, todos os detalhes.",
    Produtos: "Seu catálogo de soluções AXL.",
    Pedidos: "Da primeira ideia à entrega.",
    Produção: "Acompanhe o que está ganhando forma.",
    Estoque: "Os materiais que fazem tudo acontecer.",
    Financeiro: "Faturamento e caixa, com clareza.",
    Metas: "Pequenos passos. Grandes resultados.",
    Prospecção: "Encontre sua próxima oportunidade.",
    "Visitas / Rotas": "Planeje visitas e registre cada contato.",
    Vendedores: "Uma equipe conectada aos resultados.",
    Relatórios: "Decisões apoiadas nos seus números.",
    "Inteligência AXL": "Descubra onde estão suas melhores conexões.",
    Configurações: "A plataforma do seu jeito.",
  };
  const primary: Record<string, [string, string]> = {
    Clientes: ["Novo cliente", "company"],
    Leads: ["Novo lead", "lead"],
    Vendas: ["Registrar venda", "quick-sale"],
    Produtos: ["Novo produto", "product"],
    Financeiro: ["Nova despesa", "expense"],
    Vendedores: ["Novo vendedor", "seller"],
    "Visitas / Rotas": ["Criar rota", "route"],
  };
  const periodFilter = (
    <div className="period-filter">
      <select
        aria-label="Período"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      >
        {[
          "Todo o histórico",
          "Hoje",
          "7 dias",
          "30 dias",
          "Este mês",
          "Mês anterior",
          "Este ano",
          "Personalizado",
        ].map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      {period === "Personalizado" && (
        <>
          <input
            type="date"
            aria-label="Data inicial"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
          <input
            type="date"
            aria-label="Data final"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </>
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <Radio size={26} />
          <strong>
            AXL<span> NFC</span>
          </strong>
          <button
            className="mobile-only icon-button"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-mark">A</span>
          <div>
            <strong>AXL Gestão</strong>
            <small>Seu espaço de trabalho</small>
          </div>
          <ChevronRight size={14} />
        </div>
        <span className="nav-label">ESPAÇO DE TRABALHO</span>
        <nav>
          <a className="nav-item" href="/conexoes">
            Conexões do assistente
          </a>
          <a className="nav-item" href="/loja">
            Loja AXL
          </a>
          {user.role === "ADMIN" && (
            <a className="nav-item" href="/loja/admin">
              Administrar loja
            </a>
          )}
          {navigation.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? "active" : ""}
              onClick={() => go(label)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {label === "Leads" && (
                <small>{state.companies.filter((c) => c.is_lead).length}</small>
              )}
              {label === "Inteligência AXL" && (
                <span className="tiny-pill">AXL</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="signal-dot" />
          Tecnologia que aproxima.
          <button
            onClick={async () => {
              await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "logout" }),
              });
              router.push("/login");
              router.refresh();
            }}
            aria-label="Sair"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <section className="main-shell">
        <header className="topbar">
          <button
            className="mobile-only icon-button"
            onClick={() => setMobile(true)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumb">
            Seu espaço <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="global-search">
            <Search size={17} />
            <input
              placeholder="Buscar empresas, vendas, produtos…"
              aria-label="Busca universal"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span>⌕</span>
            {search && (
              <div className="search-results">
                {searchCompanies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      form("detail", c.id);
                      setSearch("");
                    }}
                  >
                    <UserRound size={16} />
                    <div>
                      {c.name}
                      <small>
                        {c.city} · {c.is_customer ? "Cliente" : "Lead"}
                      </small>
                    </div>
                  </button>
                ))}
                {state.products
                  .filter((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        form("product", p.id);
                        setSearch("");
                      }}
                    >
                      <Package size={16} />
                      {p.name}
                    </button>
                  ))}
                {state.sales
                  .filter((s) =>
                    (s.company_name + " " + s.number)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        go("Vendas");
                        form("sale-detail", s.id);
                      }}
                    >
                      <ShoppingBag size={16} />
                      Venda #{s.number} · {s.company_name}
                    </button>
                  ))}
                {state.orders
                  .filter((o) =>
                    (o.company_name + " " + o.number)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        go("Pedidos");
                        form("order", o.id);
                      }}
                    >
                      <ClipboardList size={16} />
                      Pedido #{o.number} · {o.company_name}
                    </button>
                  ))}
                {state.salespeople
                  .filter((s) =>
                    s.name.toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <button key={s.id} onClick={() => go("Vendedores")}>
                      <UsersRound size={16} />
                      {s.name}
                    </button>
                  ))}
                {!searchCompanies.length &&
                  !state.products.some((p) =>
                    p.name.toLowerCase().includes(search.toLowerCase()),
                  ) &&
                  !state.sales.some((s) =>
                    (s.company_name + " " + s.number)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) &&
                  !state.orders.some((o) =>
                    (o.company_name + " " + o.number)
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  ) &&
                  !state.salespeople.some((s) =>
                    s.name.toLowerCase().includes(search.toLowerCase()),
                  ) && <p>Nenhum resultado.</p>}
              </div>
            )}
          </div>
          <button
            className="icon-button"
            aria-label="Atualizar dados"
            onClick={() => refresh().catch((e) => setError(e.message))}
          >
            <RefreshCw size={18} />
          </button>
          <button
            className="notification icon-button"
            onClick={() => go("Central do Dia")}
            aria-label="Ver retornos e alertas"
          >
            <Bell size={19} />
            {pending.length > 0 && <i />}
          </button>
          <div className="user-block">
            <span className="avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>
                {user.role === "ADMIN" ? "Administrador" : "Colaborador"}
              </small>
            </div>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">AXL GESTÃO & PROSPECÇÃO</span>
              <h1>{page === "Central do Dia" ? "Olá, equipe AXL 👋" : page}</h1>
              <p>{heading[page]}</p>
            </div>
            <div className="heading-actions">
              {page === "Central do Dia" ? (
                <>
                  <span className="date-chip">{dateBR(day)}</span>
                  <button
                    className="primary"
                    onClick={() => form("quick-sale")}
                  >
                    <Plus size={17} />
                    Registrar venda
                  </button>
                </>
              ) : primary[page] ? (
                <button
                  className="primary"
                  onClick={() => form(primary[page][1])}
                >
                  <Plus size={17} />
                  {primary[page][0]}
                </button>
              ) : ["Dashboard", "Relatórios", "Inteligência AXL"].includes(
                  page,
                ) ? (
                periodFilter
              ) : null}
            </div>
          </div>
          {!state.v2 && user.role === "ADMIN" && (
            <p className="notice">
              A atualização operacional do banco precisa ser aplicada para
              ativar venda rápida, estoque e colaboração.{" "}
              <a
                href="https://github.com/28yb92pbb7-wq/axl-gestao/blob/AXL-gestao/database/update-2026-10-06.sql"
                target="_blank"
                rel="noreferrer"
              >
                Abrir atualização SQL
              </a>
            </p>
          )}
          <div className="demo-banner">
            <span className="signal-dot" />
            {state.backend === "supabase"
              ? "Supabase conectado · Dados compartilhados entre seus dispositivos"
              : "Ambiente local · Dados salvos neste banco"}
            <Badge tone="neutral">MVP</Badge>
          </div>
          {state.sales.some((s) => s.import_source) && (
            <section className="notice">
              <strong>Histórico da planilha AXL:</strong>{" "}
              {state.sales.filter((s) => s.import_source).length} vendas ·{" "}
              {state.sales
                .filter((s) => s.import_source)
                .reduce((sum, s) => sum + s.plates, 0)}{" "}
              placas ·{" "}
              {money(
                state.sales
                  .filter((s) => s.import_source)
                  .reduce((sum, s) => sum + s.total, 0),
              )}
              . Consulte Clientes, Vendas e Dashboard → Todo o histórico. Custos
              e pagamentos não informados permanecem a confirmar.
            </section>
          )}
          {[
            "Dashboard",
            "Vendas",
            "Clientes",
            "Leads",
            "Relatórios",
            "Financeiro",
          ].includes(page) && (
            <section className="panel settings-card">
              <div className="form-grid">
                <label>
                  Cidade
                  <select
                    value={cityFilter}
                    onChange={(e) => setCityFilter(e.target.value)}
                  >
                    <option value="">Todas</option>
                    {[...new Set(state.companies.map((c) => c.city))]
                      .filter(Boolean)
                      .sort()
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Segmento
                  <select
                    value={segmentFilter}
                    onChange={(e) => setSegmentFilter(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {[
                      ...new Set(
                        state.companies.map((c) => c.segment || "Outros"),
                      ),
                    ]
                      .sort()
                      .map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Responsável
                  <select
                    value={ownerFilter}
                    onChange={(e) => setOwnerFilter(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {state.salespeople.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {page !== "Dashboard" && periodFilter}
              <button
                className="text-button"
                onClick={() => {
                  setCityFilter("");
                  setSegmentFilter("");
                  setOwnerFilter("");
                }}
              >
                Limpar cidade, segmento e responsável
              </button>
            </section>
          )}
          <CentralView
            page={page}
            state={state}
            revenue={revenue}
            goal={goal}
            todaySales={todaySales}
            day={day}
            totalBalance={totalBalance}
            opportunities={opportunities}
            pending={pending}
            inventoryLow={inventoryLow}
            go={go}
            form={form}
            mutate={mutate}
            setError={setError}
          />
          <DashboardView
            page={page}
            state={{
              ...state,
              companies: state.companies.filter((c) => scopeCompany(c.id)),
            }}
            total={total}
            paid={paid}
            profit={profit}
            start={start}
            end={end}
            selected={selected}
            chart={chart}
            segments={segments}
            drill={(title, rows, companies) =>
              setDrill({ title, ids: rows.map((s) => s.id), companies })
            }
          />
          <CompaniesView
            page={page}
            pipeline={pipeline}
            setPipeline={setPipeline}
            filter={filter}
            setFilter={setFilter}
            filteredCompanies={filteredCompanies}
            state={state}
            form={form}
            mutate={mutate}
            setError={setError}
          />
          <CatalogView
            page={page}
            state={page === "Vendas" ? { ...state, sales: selected } : state}
            form={form}
            day={day}
          />
          <OrdersView
            page={page}
            state={state}
            form={form}
            mutate={mutate}
            setError={setError}
          />
          <StockView
            page={page}
            state={state}
            inventoryLow={inventoryLow}
            form={form}
          />
          <FinanceView
            page={page}
            state={state}
            filteredSales={selected}
            totalBalance={totalBalance}
            form={form}
          />
          <PlanningView
            page={page}
            state={state}
            now={now}
            day={day}
            month={month}
            form={form}
          />
          <RankingsView page={page} state={state} selected={selected} />
          <RoutesView
            page={page}
            state={state}
            form={form}
            mutate={mutate}
            setError={setError}
          />
          {page === "Prospecção" && (
            <Prospecting mutate={mutate} state={state} />
          )}
          <SettingsView
            page={page}
            state={state}
            mutate={mutate}
            setToast={setToast}
            user={user}
          />
          <footer className="app-footer">
            <span>AXL NFC · Tecnologia que aproxima.</span>
            <span>Gestão & Prospecção · v0.1</span>
          </footer>
        </main>
      </section>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {error && (
        <Dialog title="Não foi possível concluir" close={() => setError("")}>
          <p className="notice error">{error}</p>
          <button
            className="secondary"
            onClick={() => {
              setError("");
              refresh().catch((e) => setError(e.message));
            }}
          >
            <RefreshCw size={16} />
            Atualizar dados
          </button>
        </Dialog>
      )}
      {drill && (
        <Dialog title={drill.title} close={() => setDrill(undefined)}>
          <p>
            {period} · {cityFilter || "Todas as cidades"} ·{" "}
            {segmentFilter || "Todos os segmentos"} ·{" "}
            {ownerFilter
              ? state.salespeople.find((s) => s.id === ownerFilter)?.name
              : "Todos os responsáveis"}
          </p>
          <Table
            rows={state.sales.filter((s) => drill.ids.includes(s.id))}
            columns={[
              {
                key: "company_name",
                label: "Empresa",
                render: (s) => (
                  <button
                    className="text-button"
                    onClick={() => {
                      setDrill(undefined);
                      form("detail", s.company_id);
                    }}
                  >
                    {s.company_name}
                  </button>
                ),
              },
              {
                key: "total",
                label: "Venda",
                render: (s) => (
                  <button
                    className="text-button"
                    onClick={() => {
                      setDrill(undefined);
                      form("sale-detail", s.id);
                    }}
                  >
                    {money(s.total)}
                  </button>
                ),
              },
              {
                key: "cost_status",
                label: "Custo",
                render: (s) =>
                  !costKnown(s)
                    ? "Não informado"
                    : s.cost_status === "estimated"
                      ? "Estimado"
                      : "Confirmado",
              },
              {
                key: "paid",
                label: "Recebido",
                render: (s) =>
                  paymentKnown(s) ? money(s.paid) : "Não informado",
              },
            ]}
          />
          {drill.companies && (
            <Table
              rows={state.companies.filter((c) =>
                drill.companies!.includes(c.id),
              )}
              columns={[
                {
                  key: "name",
                  label: "Empresa",
                  render: (c) => (
                    <button
                      className="text-button"
                      onClick={() => {
                        setDrill(undefined);
                        form("detail", c.id);
                      }}
                    >
                      {c.name}
                    </button>
                  ),
                },
                { key: "city", label: "Cidade" },
                { key: "status", label: "Etapa" },
              ]}
            />
          )}
        </Dialog>
      )}
      {modal && (
        <EntityDialog
          modal={modal}
          state={state}
          mutate={mutate}
          setModal={setModal}
          form={form}
        />
      )}
    </div>
  );
}
