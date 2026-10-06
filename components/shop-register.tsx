"use client";
import { useState } from "react";
import Link from "next/link";
export default function ShopRegister() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="shop-shell">
      <Link href="/loja">Loja AXL</Link>
      <h1>Criar minha conta</h1>
      <p>O cadastro será analisado antes de permitir compras.</p>
      <form
        className="panel settings-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await fetch("/api/shop/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                Object.fromEntries(new FormData(e.currentTarget).entries()),
              ),
            });
            const d = await r.json();
            setMessage(d.message || d.error);
          } catch {
            setMessage("Não foi possível concluir o cadastro.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Nome
          <input name="name" required minLength={2} autoComplete="name" />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Telefone
          <input name="phone" required minLength={8} autoComplete="tel" />
        </label>
        <label>
          Estabelecimento (opcional)
          <input name="business" />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Cadastrando…" : "Enviar cadastro"}
        </button>
        {message && <p role="status">{message}</p>}
        <Link href="/login">Entrar na minha conta</Link>
      </form>
    </main>
  );
}
