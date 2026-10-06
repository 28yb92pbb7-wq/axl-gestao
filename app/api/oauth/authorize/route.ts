import { requestOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { currentUser, checkOrigin } from "@/lib/auth";
import { issueCode } from "@/lib/assistant-oauth";
export async function POST(r: Request) {
  if (!checkOrigin(r))
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  try {
    const f = await r.formData();
    if (f.get("consent") !== "yes")
      throw new Error("Consentimento necessário.");
    const d = Object.fromEntries(f.entries());
    delete d.consent;
    return NextResponse.redirect(
      await issueCode(d, user, requestOrigin(r)),
      303,
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
