import { NextResponse } from "next/server";
import { login, logout, checkOrigin } from "@/lib/auth";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  let data;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Dados de login inválidos." },
      { status: 400 },
    );
  }
  if (!data || typeof data !== "object")
    return NextResponse.json(
      { error: "Dados de login inválidos." },
      { status: 400 },
    );
  if (data.action === "logout") {
    await logout();
    return NextResponse.json({ ok: true });
  }
  if (
    typeof data.email !== "string" ||
    typeof data.password !== "string" ||
    data.email.length > 200 ||
    data.password.length > 256
  )
    return NextResponse.json(
      { error: "Informe e-mail e senha." },
      { status: 400 },
    );
  const key = data.email.toLowerCase();
  const previous = attempts.get(key);
  if (previous && previous.until > Date.now() && previous.count >= 8)
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde 15 minutos." },
      { status: 429 },
    );
  try {
    if (!(await login(key, data.password))) {
      const count =
        previous && previous.until > Date.now() ? previous.count + 1 : 1;
      attempts.set(key, { count, until: Date.now() + 900000 });
      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 },
      );
    }
    attempts.delete(key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login indisponível." },
      { status: 503 },
    );
  }
}
