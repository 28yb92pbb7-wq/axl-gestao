import { redirect } from "next/navigation";
import { operationalRole } from "@/lib/operations-schema";
import { currentUser } from "@/lib/auth";
import { readApplicationState } from "@/lib/application-service";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "COMPRADOR") redirect("/loja/conta");
  if (!operationalRole(user.role))
    return (
      <main className="login-card">
        O acesso por perfil será disponibilizado na próxima etapa. Entre com o
        administrador.
      </main>
    );
  return <Workspace user={user} initialState={await readApplicationState()} />;
}
