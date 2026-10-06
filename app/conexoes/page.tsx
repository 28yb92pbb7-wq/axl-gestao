import { currentUser } from "@/lib/auth";
import { operationalRole } from "@/lib/operations-schema";
import { redirect } from "next/navigation";
import Connections from "@/components/assistant-connections";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!operationalRole(user.role)) redirect("/loja/conta");
  return <Connections />;
}
