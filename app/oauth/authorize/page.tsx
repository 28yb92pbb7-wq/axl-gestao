import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { operationalRole } from "@/lib/operations-schema";
import { authorizeSchema } from "@/lib/assistant-oauth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const user = await currentUser();
  if (!user)
    redirect(
      "/login?next=" +
        encodeURIComponent(
          "/oauth/authorize?" + new URLSearchParams(params).toString(),
        ),
    );
  if (!operationalRole(user.role))
    return (
      <main className="shop-shell">
        A integração está disponível somente para a equipe AXL.
      </main>
    );
  const parsed = authorizeSchema.safeParse(params);
  if (!parsed.success)
    return <main className="shop-shell">Solicitação de conexão inválida.</main>;
  return (
    <main className="shop-shell">
      <h1>Autorizar assistente na AXL</h1>
      <p>
        Você está conectado como {user.name}. Esta autorização vale apenas para
        a AXL deste site.
      </p>
      <p>
        Aplicativo solicitante: <code>{parsed.data.client_id}</code>. Retorno
        autorizado: <code>{parsed.data.redirect_uri}</code>.
      </p>
      <p>
        {parsed.data.scope.includes("axl:write")
          ? "O assistente poderá consultar registros e executar vendas, recebimentos, despesas, compras, contatos e atualização de pedidos quando você solicitar."
          : "O assistente poderá consultar empresas, vendas, pendências e estoque."}
      </p>
      <p>
        A conexão não permite administrar usuários, executar SQL, movimentar
        banco ou enviar mensagens. A autorização expira em uma hora e pode ser
        revogada na página Conexões.
      </p>
      <form action="/api/oauth/authorize" method="POST">
        {Object.entries(parsed.data).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <label>
          <input name="consent" value="yes" type="checkbox" required />
          Autorizo este acesso para o assistente solicitado
        </label>
        <button className="primary">Autorizar conexão</button>
      </form>
      <Link href="/">Cancelar e voltar à gestão</Link>
    </main>
  );
}
