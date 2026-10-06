"use client";
import GoogleDiagnostic from "../google-diagnostic";

import { money, dateBR } from "@/lib/domain";
import type { State } from "@/lib/types";
import type { User } from "@/lib/auth";
import { ActionForm, Badge, Table, type Mutate } from "../ui";

export default function SettingsView({
  page,
  state,
  mutate,
  setToast,
  user,
}: {
  page: string;
  state: State;
  mutate: Mutate;
  setToast: (value: string) => void;
  user: User;
}) {
  return (
    <>
      {page === "Configurações" && (
        <div className="settings-grid">
          {user.role === "ADMIN" && <GoogleDiagnostic />}
          {(state.imports || []).map((archive) => (
            <section className="panel settings-card" key={archive.sha256}>
              <h2>Planilha importada</h2>
              <p>{archive.filename}</p>
              <p>
                {archive.count} vendas · {archive.plates} placas ·{" "}
                {money(archive.total)}
              </p>
              <p>
                O arquivo original preserva todas as abas. Os resumos e fichas
                não duplicam vendas. Datas imprecisas, pagamentos e custos
                ausentes continuam identificados no histórico.
              </p>
              <a
                className="secondary"
                href={`/api/imports/${archive.sha256}/file`}
              >
                Baixar planilha original
              </a>
            </section>
          ))}
          <section className="panel settings-card">
            <h2>AXL Opportunity Score</h2>
            <p>
              Pesos editáveis para orientar a priorização. Dados Google não
              consultados não recebem pontos.
            </p>
            {user.role === "ADMIN" && (
              <ActionForm
                action="weights"
                mutate={mutate}
                close={() => setToast("Pesos atualizados.")}
                fields={Object.entries(state.weights).map(([key, value]) => ({
                  name: key,
                  label: (
                    {
                      rating: "Nota Google",
                      reviews: "Poucas avaliações",
                      phone: "Telefone disponível",
                      website: "Sem site",
                      segment: "Aderência do segmento",
                      contact: "Nunca contatado",
                      other: "Outros (reservado)",
                    } as Record<string, string>
                  )[key],
                  type: "number",
                  value,
                }))}
              />
            )}
          </section>
          <section className="panel settings-card">
            <h2>Integrações e acesso</h2>
            <Badge>
              {state.backend === "supabase"
                ? "Supabase ativo"
                : "Banco SQLite local ativo"}
            </Badge>
            <p>
              Administrador autenticado com sessão segura. Google Places usa a
              chave do servidor <code>GOOGLE_PLACES_API_KEY</code>.
            </p>
            <p>
              {state.backend === "supabase"
                ? "Login e dados utilizam Supabase Auth e PostgreSQL com RLS. Os dados são compartilhados entre seus dispositivos."
                : "O adaptador de banco e login remoto está implementado. Configure o projeto Supabase e selecione AXL_BACKEND=supabase antes de publicar na Vercel."}
            </p>
            <p>
              Administradores gerenciam contas e configuração. Colaboradores
              compartilham a operação desta AXL. Os perfis especializados de
              produção e financeiro permanecem sem acesso.
            </p>
            <h3>Usuário atual</h3>
            <p>
              {user.name}
              <br />
              {user.email}
            </p>
            <h3>Próximas etapas</h3>
            <p>
              Consulte <code>TODO.md</code> para acompanhar todo o escopo.
            </p>
          </section>
          <section className="panel settings-card">
            <h2>Usuários</h2>
            <p>
              Administradores podem criar contas no provedor atual. Laura deve
              ter uma conta própria com perfil Colaborador; o acesso usa os
              mesmos dados da AXL. Convites não são enviados automaticamente.
            </p>
            {user.role === "ADMIN" && (
              <ActionForm
                action="user"
                mutate={mutate}
                close={() => setToast("Usuário criado.")}
                fields={[
                  { name: "name", label: "Nome", required: true },
                  {
                    name: "email",
                    label: "E-mail",
                    type: "email",
                    required: true,
                  },
                  {
                    name: "password",
                    label: "Senha inicial (mínimo 12 caracteres)",
                    type: "password",
                    required: true,
                  },
                  {
                    name: "role",
                    label: "Perfil",
                    type: "select",
                    options: [
                      { value: "ADMIN", label: "Administrador" },
                      {
                        value: "VENDEDOR",
                        label: "Colaborador AXL",
                      },
                      {
                        value: "PRODUCAO",
                        label: "Produção (acesso ainda bloqueado)",
                      },
                      {
                        value: "FINANCEIRO",
                        label: "Financeiro (acesso ainda bloqueado)",
                      },
                    ],
                  },
                ]}
              />
            )}
            <Table
              rows={state.profiles}
              columns={[
                { key: "name", label: "Nome" },
                { key: "email", label: "E-mail" },
                { key: "role", label: "Perfil" },
              ]}
            />
          </section>
          <section className="panel settings-card">
            <h2>Trocar minha senha</h2>
            <ActionForm
              action="password"
              mutate={mutate}
              close={() => setToast("Senha alterada.")}
              fields={[
                {
                  name: "current_password",
                  label: "Senha atual",
                  type: "password",
                  required: true,
                },
                {
                  name: "new_password",
                  label: "Nova senha (mínimo 12 caracteres)",
                  type: "password",
                  required: true,
                },
              ]}
            />
          </section>
          <section className="span-2">
            <h2>Auditoria recente</h2>
            <Table
              rows={state.audit}
              columns={[
                { key: "name", label: "Usuário" },
                { key: "action", label: "Ação" },
                {
                  key: "created_at",
                  label: "Data",
                  render: (a) => dateBR(a.created_at + "Z"),
                },
                { key: "entity_id", label: "Registro" },
              ]}
            />
          </section>
        </div>
      )}
    </>
  );
}
