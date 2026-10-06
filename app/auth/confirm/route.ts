import { requestOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/integrations/supabase-server";
export async function GET(r: Request) {
  const u = new URL(r.url);
  const code = u.searchParams.get("code");
  if (code) {
    const c = await supabaseServer();
    const { error } = await c.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(new URL("/loja/conta", requestOrigin(r)));
  }
  return NextResponse.redirect(
    new URL("/login?message=confirmacao_expirada", requestOrigin(r)),
  );
}
