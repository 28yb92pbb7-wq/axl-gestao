import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentUser, checkOrigin } from "@/lib/auth";
import {
  mutateApplication,
  readApplicationState,
} from "@/lib/application-service";
export const runtime = "nodejs";
export async function GET() {
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Faça login para continuar." },
      { status: 401 },
    );
  if (user.role !== "ADMIN")
    return NextResponse.json(
      { error: "Acesso restrito ao administrador nesta primeira versão." },
      { status: 403 },
    );
  return NextResponse.json(await readApplicationState(), {
    headers: { "Cache-Control": "no-store" },
  });
}
export async function POST(request: Request) {
  if (!checkOrigin(request))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user)
    return NextResponse.json(
      { error: "Sessão expirada. Faça login novamente." },
      { status: 401 },
    );
  try {
    const { action, data } = await request.json();
    const result = await mutateApplication(action, data, user);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message =
      error instanceof ZodError
        ? "Confira os campos preenchidos. " +
          error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : error instanceof Error
          ? error.message
          : "Não foi possível salvar.";
    return NextResponse.json(
      {
        error: /UNIQUE constraint/.test(message)
          ? "Já existe um registro com este identificador."
          : /FOREIGN KEY/.test(message)
            ? "Um dos registros relacionados não existe."
            : message,
      },
      { status: 400 },
    );
  }
}
