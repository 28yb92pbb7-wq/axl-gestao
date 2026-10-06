import {
  assistantInputs,
  assistantActions,
  type AssistantTool,
} from "./assistant-schema";
import { assistantToken, initAssistant, resource } from "./assistant-oauth";
import { supabaseEnabled } from "./backend";
import { supabaseForUser } from "./integrations/supabase";
import { prepareMapsImport, getMapsPreview } from "./maps-import";
import { validateMapsUrl } from "./maps-links";
import { one, run, transaction, audit } from "./db";
import { readState } from "./service";
import { readLocalOperations } from "./operations-local";
import { mutateApplication } from "./application-service";
export async function assistantCall(
  name: string,
  input: unknown,
  token: string,
  origin: string,
) {
  if (!Object.hasOwn(assistantInputs, name))
    throw new Error("Ferramenta não autorizada.");
  const tool = name as AssistantTool;
  const d = assistantInputs[tool].strict().parse(input) as Record<
    string,
    unknown
  >;
  const identity = await assistantToken(token, origin);
  if (tool === "preparar_importacao")
    return prepareMapsImport(d as { text: string }, identity.user.id);
  const write = !!assistantActions[tool] || tool === "confirmar_empresa";
  if (write && !identity.scope.includes("axl:write"))
    throw new Error("Conexão autorizada somente para leitura.");
  if (tool === "confirmar_empresa") {
    const p = d.token
      ? getMapsPreview(String(d.token), identity.user.id)
      : undefined;
    d.place_id = p?.place.id || null;
    d.consulted_at = p ? new Date(p.expires - 900000).toISOString() : null;
    d.url = validateMapsUrl(String(d.url)).href;
  }
  if (supabaseEnabled()) {
    const c = supabaseForUser();
    const { data, error } = await c.rpc("assistant_execute", {
      h: identity.hash,
      r: resource(origin),
      a: tool,
      d,
    });
    if (error)
      throw new Error(
        error.code === "P0001"
          ? error.message
          : "A operação não foi confirmada. Consulte o identificador antes de repetir.",
      );
    return data;
  }
  initAssistant();
  if (tool === "buscar_empresa") {
    return readState()
      .companies.filter((c) =>
        d.id
          ? c.id === d.id
          : c.name.toLowerCase().includes(String(d.name || "").toLowerCase()),
      )
      .map((c) => ({ id: c.id, name: c.name, city: c.city, status: c.status }));
  }
  if (tool === "consultar_resumo") {
    const s = { ...readState(), ...readLocalOperations() };
    return {
      sales: s.sales.reduce((n, x) => n + x.total, 0),
      received: s.payments.reduce((n, x) => n + x.amount, 0),
      orders: s.orders
        .filter((o) => !["Entregue", "Cancelado"].includes(String(o.status)))
        .map((o) => ({ id: o.id, status: o.status })),
      inventory: s.inventory.map((i) => ({
        id: i.id,
        name: i.name,
        quantity: i.quantity,
        quantity_known: i.quantity_known,
      })),
    };
  }
  const previous = one<{ action: string; payload: string; result: string }>(
    "SELECT action,payload,result FROM assistant_operations WHERE user_id=? AND request_id=?",
    identity.user.id,
    String(d.request_id),
  );
  if (tool === "consultar_operacao")
    return previous ? JSON.parse(previous.result) : null;
  if (previous) {
    if (
      previous.action !== tool ||
      JSON.stringify(JSON.parse(previous.payload)) !== JSON.stringify(d)
    )
      throw new Error("Identificador já usado com dados diferentes.");
    return JSON.parse(previous.result);
  }
  const action =
    tool === "confirmar_empresa" ? "maps_company" : assistantActions[tool]!;
  // SQLite não permite transações assíncronas. As operações síncronas usam a mesma transação do registro de idempotência.
  if (action === "maps_company") {
    const result = await mutateApplication(action, d, identity.user);
    transaction(() => {
      run(
        "INSERT OR IGNORE INTO assistant_operations(user_id,request_id,action,payload,result) VALUES(?,?,?,?,?)",
        identity.user.id,
        String(d.request_id),
        tool,
        JSON.stringify(d),
        JSON.stringify(result),
      );
      audit(
        identity.user.id,
        "Assistente · " + tool,
        String((result as { id: string }).id),
      );
    });
    return result;
  }
  const { operationSchemas } = await import("./operations-schema");
  const { mutateLocalOperation } = await import("./operations-local");
  const { mutate } = await import("./service");
  return transaction(() => {
    const result = Object.hasOwn(operationSchemas, action)
      ? mutateLocalOperation(
          action as keyof typeof operationSchemas,
          d,
          identity.user,
        )
      : mutate(action, d, { ...identity.user, role: "ADMIN" });
    run(
      "INSERT INTO assistant_operations(user_id,request_id,action,payload,result) VALUES(?,?,?,?,?)",
      identity.user.id,
      String(d.request_id),
      tool,
      JSON.stringify(d),
      JSON.stringify(result),
    );
    audit(
      identity.user.id,
      "Assistente · " + tool + " · campos: " + Object.keys(d).join(","),
      typeof result === "string"
        ? result
        : String((result as { id?: string })?.id || identity.user.id),
    );
    return result;
  });
}
