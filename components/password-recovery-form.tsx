"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { recoveryTokens } from "@/lib/password-recovery";
export default function PasswordRecoveryForm() {
  const [tokens, setTokens] = useState<ReturnType<typeof recoveryTokens>>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const parsed = recoveryTokens(window.location.hash);
      setTokens(parsed);
      window.history.replaceState(null, "", "/reset-password");
      if (!parsed)
        setMessage(
          "Informe seu e-mail para receber um novo link de recuperação.",
        );
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const f = new FormData(event.currentTarget);
    if (tokens && f.get("password") !== f.get("confirm")) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          tokens
            ? { action: "reset", ...tokens, password: f.get("password") }
            : { action: "request", email: f.get("email") },
        ),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setMessage(
        tokens ? "Senha atualizada. Entre com sua nova senha." : data.message,
      );
      if (tokens) {
        setDone(true);
        setTokens(undefined);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-form">
        <form onSubmit={submit}>
          <span className="eyebrow">AXL GESTÃO</span>
          <h2>{tokens ? "Criar nova senha" : "Recuperar acesso"}</h2>
          {message && (
            <div className="notice" role="status">
              {message}
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {!done && (
            <>
              {tokens ? (
                <>
                  <label>
                    Nova senha
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={256}
                      required
                    />
                  </label>
                  <label>
                    Confirmar senha
                    <input
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={256}
                      required
                    />
                  </label>
                </>
              ) : (
                <label>
                  E-mail
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Aguarde…"
                  : tokens
                    ? "Salvar nova senha"
                    : "Enviar link de recuperação"}
              </button>
            </>
          )}
          <Link href="/login">Voltar para entrar</Link>
        </form>
      </section>
    </main>
  );
}
