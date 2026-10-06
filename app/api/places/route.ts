import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json(
    { error: "Use Adicionar pelo Google Maps e cole o link da empresa." },
    { status: 410 },
  );
}
