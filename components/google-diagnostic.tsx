"use client";
import { useState } from "react";
export default function GoogleDiagnostic() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  return (
    <section className="panel settings-card">
      <h3>Google Places</h3>
      <p>
        A busca usa a chave privada do servidor. O mapa incorporado usa uma
        chave distinta, limitada ao domínio do site.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/places", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ mode: "test" }),
            });
            const d = await r.json();
            setResult(d.message || d.error);
          } catch {
            setResult("Não foi possível acessar o servidor.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Testando…" : "Testar conexão Google"}
      </button>
      {result && (
        <p className="notice" role="status">
          {result}
        </p>
      )}
    </section>
  );
}
