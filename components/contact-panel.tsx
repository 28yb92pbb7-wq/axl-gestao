"use client";
import { useState } from "react";
import type { State, Company } from "@/lib/types";
import { whatsappLink } from "@/lib/contact";
import { stages } from "@/lib/domain";
import { ActionForm, type Mutate } from "./ui";
export default function ContactPanel({
  company,
  state,
  mutate,
}: {
  company: Company;
  state: State;
  mutate: Mutate;
}) {
  const [phone, setPhone] = useState(company.phone || "");
  const [text, setText] = useState(
    `Olá! Sou da AXL. Gostaria de apresentar nossas soluções para ${company.name}.`,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("");
  return (
    <section className="panel settings-card">
      <h3>Contato e acompanhamento</h3>
      <div className="form-grid">
        <label>
          WhatsApp (DDI e DDD)
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label>
          Mensagem editável
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label>
          Etapa comercial
          <select
            value={company.status}
            disabled={busy}
            onChange={async (e) => {
              const status = e.target.value;
              const reason =
                status === "Perdido"
                  ? window.prompt("Motivo da perda") || ""
                  : "";
              setBusy(true);
              try {
                await mutate("stage_confirm", {
                  company_id: company.id,
                  status,
                  reason,
                });
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s === "Venda" ? "Ganho / venda" : s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row-actions">
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            try {
              const url = whatsappLink(phone, text);
              window.open(url, "_blank", "noopener,noreferrer");
              await mutate("contact", {
                company_id: company.id,
                type: "WhatsApp aberto",
                phone,
                text,
                result: "Não informado",
              });
              setError("");
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          Abrir WhatsApp
        </button>
        <button className="primary" onClick={() => setMode("Mensagem enviada")}>
          Confirmar mensagem enviada
        </button>
        <button className="secondary" onClick={() => setMode("Resposta")}>
          Registrar resposta / contato
        </button>
        <button className="secondary" onClick={() => setMode("Proposta")}>
          Preparar proposta
        </button>
      </div>
      <p className="muted">
        Abrir WhatsApp registra uma tentativa. Confirme o envio e o texto
        efetivamente enviado; o sistema não envia mensagens automaticamente.
      </p>
      {mode === "Proposta" ? (
        <ActionForm
          key={mode}
          action="proposal"
          mutate={mutate}
          close={() => setMode("")}
          extra={{ company_id: company.id }}
          fields={[
            {
              name: "text",
              label: "Proposta em rascunho",
              type: "textarea",
              required: true,
            },
            {
              name: "amount",
              label: "Valor (R$, opcional)",
              type: "money",
              nullable: true,
            },
          ]}
        />
      ) : (
        mode && (
          <ActionForm
            key={mode}
            action="contact"
            mutate={mutate}
            close={() => setMode("")}
            extra={{ company_id: company.id }}
            fields={[
              {
                name: "type",
                label: "Tipo de contato confirmado",
                type: "select",
                value: mode,
                options: [
                  "Mensagem enviada",
                  "Resposta",
                  "Ligação",
                  "Visita",
                  "Observação",
                ].map((v) => ({ value: v, label: v })),
              },
              { name: "phone", label: "Número utilizado", value: phone },
              {
                name: "text",
                label: "Texto efetivo / resposta recebida",
                type: "textarea",
                value: mode === "Mensagem enviada" ? text : "",
                required: true,
              },
              {
                name: "result",
                label: "Resultado",
                type: "select",
                options: [
                  "Não informado",
                  "Sem resposta",
                  "Respondeu",
                  "Interessado",
                  "Não interessado",
                  "Retorno combinado",
                ].map((v) => ({ value: v, label: v })),
              },
              {
                name: "next_at",
                label: "Próximo contato (opcional)",
                type: "datetime-local",
                nullable: true,
              },
            ]}
          />
        )
      )}{" "}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <h4>Contatos registrados</h4>
      {(state.contacts || [])
        .filter((c) => c.company_id === company.id)
        .map((c) => (
          <article key={c.id} className="inline-form">
            <strong>
              {c.type} · {c.user_name}
            </strong>
            <p>
              {new Date(
                c.created_at.includes("T")
                  ? c.created_at
                  : c.created_at.replace(" ", "T") + "Z",
              ).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{" "}
              · {c.result}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{c.text}</p>
          </article>
        ))}
      {(state.proposals || [])
        .filter((p) => p.company_id === company.id)
        .map((p) => (
          <article key={p.id} className="notice">
            <strong>Proposta · {p.status}</strong>
            <p>{p.text}</p>
          </article>
        ))}
    </section>
  );
}
