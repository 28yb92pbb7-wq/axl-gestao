"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Radio } from "lucide-react";
export default function LoginForm({ remote }: { remote: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (response.ok) {
        router.push("/");
        router.refresh();
      } else setError(result.error);
    } catch {
      setError("Não foi possível conectar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand">
          <Radio />
          <strong>
            AXL<span> NFC</span>
          </strong>
        </div>
        <div>
          <span className="eyebrow">GESTÃO & PROSPECÇÃO</span>
          <h1>
            Conexões que viram
            <br />
            <em>oportunidades.</em>
          </h1>
          <p>
            Sua operação comercial, do primeiro contato à próxima conquista.
            Tudo em um só lugar.
          </p>
        </div>
        <small>Tecnologia que aproxima.</small>
      </section>
      <section className="login-form">
        <form method="post" action="/api/auth" onSubmit={submit}>
          <span className="eyebrow">BEM-VINDO À AXL</span>
          <h2>Vamos começar?</h2>
          <p>Entre para acompanhar sua operação.</p>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              placeholder="seu@email.com"
            />
          </label>
          <label>
            Senha
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              placeholder="Sua senha"
            />
          </label>
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Entrando…" : "Entrar na plataforma"}
            <ArrowRight size={18} />
          </button>
          {remote && <Link href="/reset-password">Esqueci minha senha</Link>}
          <div className="notice">
            {remote ? (
              "Entre com o e-mail e a senha do administrador configurado no projeto AXL. Seu acesso é o mesmo no computador e no celular."
            ) : (
              <>
                Ambiente local de desenvolvimento. O acesso inicial fica em{" "}
                <code>.data/acesso-inicial.txt</code>, criado na preparação do
                banco.
              </>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
