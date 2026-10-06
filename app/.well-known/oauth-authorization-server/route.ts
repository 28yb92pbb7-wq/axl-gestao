import { requestOrigin } from "@/lib/request-origin";
import { NextResponse } from "next/server";
export async function GET(r: Request) {
  const o = requestOrigin(r);
  return NextResponse.json({
    issuer: o,
    authorization_endpoint: o + "/oauth/authorize",
    token_endpoint: o + "/api/oauth/token",
    registration_endpoint: o + "/api/oauth/register",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["axl:read", "axl:write"],
  });
}
