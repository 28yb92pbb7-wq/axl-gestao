import { z } from "zod";
export const recoveryRequest = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("request"),
    email: z.string().trim().email().max(200),
  }),
  z.object({
    action: z.literal("reset"),
    access_token: z.string().min(20).max(16000),
    refresh_token: z.string().min(10).max(16000),
    password: z.string().min(12).max(256),
  }),
]);
export function recoveryTokens(hash: string) {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = p.get("access_token"),
    refresh_token = p.get("refresh_token");
  if (p.get("type") !== "recovery" || !access_token || !refresh_token)
    return undefined;
  return { access_token, refresh_token };
}
export async function completePasswordRecovery(
  client: {
    auth: {
      setSession: (tokens: {
        access_token: string;
        refresh_token: string;
      }) => Promise<{ data: { user: unknown }; error: unknown }>;
      updateUser: (input: { password: string }) => Promise<{ error: unknown }>;
      signOut: (input: { scope: "global" }) => Promise<{ error: unknown }>;
    };
  },
  tokens: { access_token: string; refresh_token: string },
  password: string,
) {
  const session = await client.auth.setSession(tokens);
  if (session.error || !session.data.user)
    throw new Error(
      "Este link expirou ou já foi utilizado. Solicite um novo link.",
    );
  const update = await client.auth.updateUser({ password });
  if (update.error)
    throw new Error(
      "Não foi possível salvar a senha. Use uma senha nova com pelo menos 12 caracteres ou solicite outro link.",
    );
  await client.auth.signOut({ scope: "global" });
}
