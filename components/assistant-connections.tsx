"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { dateBR } from "@/lib/domain";
export default function Connections() {
  const [rows, setRows] = useState<
      {
        id: string;
        name: string;
        scope: string;
        expires_at: string;
        revoked: boolean | number;
      }[]
    >([]),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/assistant/connections")
      .then((r) => r.json())
      .then((d) => (Array.isArray(d) ? setRows(d) : setError(d.error)))
      .catch(() => setError("Falha ao consultar conexões."));
  }, []);
  return (
    <main className="shop-shell">
      <Link href="/">Voltar à gestão</Link>
      <h1>Conexões do assistente</h1>
      <p>
        Endpoint MCP após publicação: /api/mcp. Adicione-o somente em clientes
        que suportem conexão remota com OAuth e PKCE. Fixar uma conversa não
        estabelece a conexão.
      </p>
      {error && <p role="alert">{error}</p>}
      {!rows.length && <p>Nenhuma conexão autorizada.</p>}
      {rows.map((r) => (
        <section key={r.id} className="panel settings-card">
          <strong>{r.name}</strong>
          <p>
            {r.scope} · expira {dateBR(r.expires_at)} ·{" "}
            {r.revoked ? "revogada" : "ativa"}
          </p>
          <button
            disabled={!!r.revoked}
            onClick={async () => {
              const response = await fetch("/api/assistant/connections", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: r.id }),
              });
              const d = await response.json();
              if (!response.ok) setError(d.error);
              else setRows(d);
            }}
          >
            Revogar
          </button>
        </section>
      ))}
    </main>
  );
}
