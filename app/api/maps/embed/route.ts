import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json(
    { error: "Mapas e rotas abrem externamente no Google Maps." },
    { status: 410 },
  );
}
