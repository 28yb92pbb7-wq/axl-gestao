"use client";
import { useState } from "react";
import { Phone, Mail, MapPin, Pencil, Plus } from "lucide-react";
import type { Company, State } from "@/lib/types";
import { money, dateBR, opportunityScore } from "@/lib/domain";
import { ActionForm, Badge, type Mutate } from "./ui";
export default function CompanyDetail({
  company,
  state,
  mutate,
  edit,
  sell,
}: {
  company: Company;
  state: State;
  mutate: Mutate;
  edit: () => void;
  sell: () => void;
}) {
  const [tab, setTab] = useState("Histórico");
  const [form, setForm] = useState("");
  const sales = state.sales.filter((s) => s.company_id === company.id);
  const value = sales.reduce((s, v) => s + v.total, 0);
  const score = opportunityScore(
    {
      phone: company.phone,
      segment: company.segment,
      contacted: state.activities.some(
        (a) =>
          a.company_id === company.id &&
          !["Cadastro", "Alteração"].includes(a.type),
      ),
    },
    state.weights,
  );
  return (
    <div>
      <div className="detail-summary">
        <div className="avatar big">
          {company.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h2>{company.name}</h2>
          <p>
            {company.segment} · {company.city}
          </p>
          <Badge>{company.status}</Badge>
        </div>
        <button className="secondary" onClick={edit}>
          <Pencil size={15} />
          Editar
        </button>
        <button className="primary" onClick={sell}>
          <Plus size={15} />
          Registrar venda
        </button>
      </div>
      <div className="contact-row">
        <span>
          <Phone size={15} />
          {company.phone || "Telefone não informado"}
        </span>
        <span>
          <Mail size={15} />
          {company.email || "E-mail não informado"}
        </span>
        <span>
          <MapPin size={15} />
          {company.address || company.city}
        </span>
        {company.phone && (
          <a
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/55${company.phone.replace(/\D/g, "")}`}
          >
            Abrir WhatsApp
          </a>
        )}
      </div>
      <div className="metrics compact">
        <div className="metric">
          <small>LTV / Faturamento</small>
          <strong>{money(value)}</strong>
        </div>
        <div className="metric">
          <small>Compras</small>
          <strong>{sales.length}</strong>
        </div>
        <div className="metric">
          <small>Ticket médio</small>
          <strong>{money(sales.length ? value / sales.length : 0)}</strong>
        </div>
        <div className="metric">
          <small>Placas compradas</small>
          <strong>{sales.reduce((s, v) => s + v.plates, 0)}</strong>
        </div>
      </div>
      <div className="tabs">
        {["Histórico", "Vendas", "Retornos", "Cadastro", "Score"].map((t) => (
          <button
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Histórico" && (
        <>
          <button className="secondary" onClick={() => setForm("activity")}>
            <Plus size={15} />
            Registrar contato ou observação
          </button>
          <div className="timeline">
            {state.activities
              .filter((a) => a.company_id === company.id)
              .map((a) => (
                <article key={a.id}>
                  <span className="timeline-dot" />
                  <small>{dateBR(a.created_at + "Z")}</small>
                  <strong>{a.type}</strong>
                  <p>{a.description}</p>
                </article>
              ))}
          </div>
        </>
      )}
      {tab === "Vendas" && (
        <div>
          {sales.length === 0 ? (
            <p>Nenhuma venda registrada.</p>
          ) : (
            sales.map((s) => (
              <div className="list-item" key={s.id}>
                <strong>Venda #{s.number}</strong>
                <span>{dateBR(s.date)}</span>
                <strong>{money(s.total)}</strong>
                <Badge tone={s.paid >= s.total ? "green" : "amber"}>
                  {s.paid >= s.total
                    ? "Pago"
                    : "Saldo: " + money(s.total - s.paid)}
                </Badge>
              </div>
            ))
          )}
        </div>
      )}
      {tab === "Retornos" && (
        <>
          <button className="secondary" onClick={() => setForm("followup")}>
            Agendar retorno
          </button>
          {state.followups
            .filter((f) => f.company_id === company.id)
            .map((f) => (
              <div className="list-item" key={f.id}>
                <div>
                  <strong>{f.reason}</strong>
                  <small>
                    {dateBR(f.date)} · {f.responsible}
                  </small>
                </div>
                <Badge tone={f.done ? "green" : "amber"}>
                  {f.done ? "Concluído" : "Pendente"}
                </Badge>
              </div>
            ))}
        </>
      )}
      {tab === "Cadastro" && (
        <div className="form-grid">
          {[
            ["Razão social", company.legal_name],
            ["CNPJ / CPF", company.document],
            ["Responsável", company.contact],
            ["Origem", company.origin],
            ["Endereço", company.address],
            ["Bairro", company.neighborhood],
            ["CEP", company.postal_code],
            ["Estado", company.state],
            ["Observações", company.notes],
          ].map(([label, value]) => (
            <div key={label}>
              <small className="muted">{label}</small>
              <p>{value || "Não informado"}</p>
            </div>
          ))}
        </div>
      )}
      {tab === "Score" && (
        <>
          <h3>AXL Score: {score.score}/100</h3>
          <p className="notice">
            Score parcial com dados próprios. Nota e avaliações do Google só
            entram quando consultadas pela API; os cadastros de demonstração não
            têm notas fictícias.
          </p>
          {score.reasons.map((r) => (
            <div className="list-item" key={r.label}>
              <span>{r.label}</span>
              <strong>+{r.points}</strong>
            </div>
          ))}
        </>
      )}
      {form && (
        <section className="inline-form">
          <h3>
            {form === "activity" ? "Registrar atividade" : "Agendar retorno"}
          </h3>
          <ActionForm
            action={form}
            mutate={mutate}
            close={() => setForm("")}
            extra={{ company_id: company.id }}
            fields={
              form === "activity"
                ? [
                    {
                      name: "type",
                      label: "Tipo",
                      type: "select",
                      options: [
                        "Observação",
                        "Ligação",
                        "Mensagem",
                        "Visita",
                        "Proposta",
                        "Contato",
                      ].map((v) => ({ value: v, label: v })),
                    },
                    {
                      name: "description",
                      label: "Descrição",
                      type: "textarea",
                      required: true,
                    },
                  ]
                : [
                    {
                      name: "date",
                      label: "Data e horário (São Paulo)",
                      type: "datetime-local",
                      required: true,
                    },
                    {
                      name: "responsible",
                      label: "Responsável",
                      value: "Equipe AXL",
                    },
                    {
                      name: "reason",
                      label: "Motivo do retorno",
                      type: "textarea",
                      required: true,
                    },
                  ]
            }
          />
        </section>
      )}
    </div>
  );
}
