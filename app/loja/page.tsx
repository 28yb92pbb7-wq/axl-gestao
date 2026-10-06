import Shop from "@/components/shop";
import { shopState } from "@/lib/shop-service";
import { currentUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page() {
  const user = await currentUser();
  return <Shop user={user} initial={await shopState(user)} mode="catalog" />;
}
