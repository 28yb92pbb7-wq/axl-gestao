import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { readApplicationState } from "@/lib/application-service";
import Workspace from "@/components/workspace";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN")
    return (
      <main className="login-card">
        O acesso por perfil será disponibilizado na próxima etapa. Entre com o
        administrador.
      </main>
    );
  return <Workspace user={user} initialState={await readApplicationState()} />;
}
