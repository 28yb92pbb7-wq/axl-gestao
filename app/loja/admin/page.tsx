import Shop from "@/components/shop";
import { shopState } from "@/lib/shop-service";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/loja/conta");
  return <Shop user={user} initial={await shopState(user)} mode="admin" />;
}
