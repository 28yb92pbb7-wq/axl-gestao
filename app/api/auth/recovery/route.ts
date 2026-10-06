import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/auth";
import { supabaseEnabled } from "@/lib/backend";
import { supabaseForUser } from "@/lib/integrations/supabase";
import {
  recoveryRequest,
  completePasswordRecovery,
} from "@/lib/password-recovery";
const attempts = new Map<string, number>();
export async function POST(request: Request) {
  const reply = (data: object, status = 200) =>
    NextResponse.json(data, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  if (!checkOrigin(request))
    return reply({ error: "Origem não autorizada." }, 403);
  if (!supabaseEnabled())
    return reply(
      {
        error: "Recuperação por e-mail disponível apenas no backend Supabase.",
      },
      503,
    );
  let body;
  try {
    body = recoveryRequest.safeParse(await request.json());
  } catch {
    return reply({ error: "Dados inválidos." }, 400);
  }
  if (!body.success)
    return reply(
      {
        error:
          "Informe um e-mail válido ou uma senha de pelo menos 12 caracteres.",
      },
      400,
    );
  try {
    const client = supabaseForUser();
    if (body.data.action === "request") {
      const email = body.data.email.toLowerCase();
      const last = attempts.get(email);
      if (last && last > Date.now() - 60000)
        return reply(
          { error: "Aguarde um minuto antes de solicitar outro link." },
          429,
        );
      if (attempts.size > 1000)
        for (const [key, time] of attempts)
          if (time < Date.now() - 60000) attempts.delete(key);
      attempts.set(email, Date.now());
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: new URL("/reset-password", request.url).toString(),
      });
      if (error)
        return reply(
          {
            error:
              "Não foi possível enviar o link. Confira a configuração Supabase ou tente novamente mais tarde.",
          },
          503,
        );
      return reply({
        ok: true,
        message:
          "Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha.",
      });
    }
    await completePasswordRecovery(client, body.data, body.data.password);
    return reply({ ok: true });
  } catch (e) {
    return reply(
      { error: e instanceof Error ? e.message : "Recuperação indisponível." },
      400,
    );
  }
}
