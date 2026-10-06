import { requestOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
import { assistantToken } from "@/lib/assistant-oauth";
import { assistantCall } from "@/lib/assistant-service";
import { assistantTools } from "@/lib/assistant-schema";
export const runtime = "nodejs";
export async function POST(r: Request) {
  const origin = requestOrigin(r);
  const token =
    r.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1] || "";
  const browserOrigin = r.headers.get("origin");
  if (browserOrigin && browserOrigin !== origin)
    return NextResponse.json(
      { error: "Origem não autorizada." },
      { status: 403 },
    );
  try {
    await assistantToken(token, origin);
  } catch {
    return NextResponse.json(
      { error: "Conecte e autorize o assistente." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp"`,
        },
      },
    );
  }
  try {
    const d = await r.json();
    if (d.jsonrpc !== "2.0") throw new Error("Mensagem JSON-RPC inválida.");
    if (d.id === undefined) return new Response(null, { status: 202 });
    let result: unknown;
    if (d.method === "initialize") {
      if (
        !["2025-03-26", "2025-06-18", "2025-11-25"].includes(
          d.params?.protocolVersion,
        )
      )
        throw new Error("Versão MCP não suportada.");
      result = {
        protocolVersion: d.params.protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "axl-assistente", version: "1.0.0" },
        instructions:
          "Use identificadores de operação únicos. Liste homônimos e confirme a empresa selecionada. Não presuma pagamentos. Após erro incerto, consulte consultar_operacao antes de repetir.",
      };
    } else if (d.method === "ping") result = {};
    else if (d.method === "tools/list") result = { tools: assistantTools };
    else if (d.method === "tools/call") {
      try {
        const output = await assistantCall(
          d.params?.name,
          d.params?.arguments,
          token,
          origin,
        );
        result = {
          content: [{ type: "text", text: JSON.stringify(output) }],
          structuredContent: { result: output },
          isError: false,
        };
      } catch (e) {
        result = {
          content: [{ type: "text", text: (e as Error).message }],
          isError: true,
        };
      }
    } else
      return NextResponse.json({
        jsonrpc: "2.0",
        id: d.id,
        error: { code: -32601, message: "Método não suportado." },
      });
    return NextResponse.json(
      { jsonrpc: "2.0", id: d.id, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: (e as Error).message },
      },
      { status: 400 },
    );
  }
}
export async function GET() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
export async function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
