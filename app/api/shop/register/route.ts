import { requestOrigin } from "@/lib/request-origin";
import { z } from "zod";
import { NextResponse } from "next/server";
import { checkOrigin, hashPassword } from "@/lib/auth";
import { supabaseEnabled } from "@/lib/backend";
import { supabaseServer } from "@/lib/integrations/supabase-server";
import { initShop } from "@/lib/shop-local";
import { one, insert } from "@/lib/db";
const hits = new Map<string, number[]>();
export async function POST(r: Request) {
  if (!checkOrigin(r))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  try {
    const d = z
      .object({
        name: z.string().trim().min(2).max(160),
        email: z.email().max(200),
        password: z.string().min(12).max(256),
        phone: z.string().trim().min(8).max(40),
        business: z.string().max(160).default(""),
      })
      .parse(await r.json());
    const key = d.email.toLowerCase();
    const history = (hits.get(key) || []).filter(
      (t) => t > Date.now() - 900000,
    );
    if (history.length >= 3)
      return NextResponse.json(
        { error: "Aguarde 15 minutos para repetir o cadastro." },
        { status: 429 },
      );
    hits.set(key, [...history, Date.now()]);
    if (supabaseEnabled()) {
      const c = await supabaseServer();
      const { error } = await c.auth.signUp({
        email: key,
        password: d.password,
        options: {
          data: {
            name: d.name,
            phone: d.phone,
            business: d.business,
            axl_shop: true,
          },
          emailRedirectTo: new URL(
            "/auth/confirm?next=/loja/conta",
            requestOrigin(r),
          ).href,
        },
      });
      if (error)
        throw new Error(
          "Não foi possível cadastrar. Confira a configuração Auth e tente novamente.",
        );
    } else {
      if (
        process.env.NODE_ENV === "production" &&
        process.env.AXL_ALLOW_LOCAL_AUTH !== "true"
      )
        throw new Error("Cadastro local desabilitado em produção.");
      initShop();
      if (
        !one("SELECT id FROM shop_accounts WHERE email=?", key) &&
        !one("SELECT id FROM profiles WHERE email=?", key)
      )
        insert("shop_accounts", {
          name: d.name,
          email: key,
          phone: d.phone,
          business: d.business,
          password_hash: hashPassword(d.password),
          status: "pending",
        });
    }
    return NextResponse.json({
      ok: true,
      message:
        "Cadastro recebido. Confirme seu e-mail quando solicitado e aguarde a aprovação para comprar.",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof z.ZodError
            ? "Informe nome, e-mail, telefone e senha com pelo menos 12 caracteres."
            : (e as Error).message,
      },
      { status: 400 },
    );
  }
}
