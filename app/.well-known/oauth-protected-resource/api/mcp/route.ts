import { requestOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
export async function GET(r: Request) {
  const origin = requestOrigin(r);
  return NextResponse.json({
    resource: origin + "/api/mcp",
    authorization_servers: [origin],
    scopes_supported: ["axl:read", "axl:write"],
    bearer_methods_supported: ["header"],
  });
}
