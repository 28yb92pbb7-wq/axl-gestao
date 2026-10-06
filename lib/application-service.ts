import type { State } from "./types";
import {
  operationSchemas,
  type OperationAction,
  operationalRole,
} from "./operations-schema";
import { supabaseEnabled } from "./backend";
import type { User } from "./auth";
export async function readApplicationState() {
  const { readMapLinks } = await import("./maps-crm");
  const mapLinks = await readMapLinks();
  if (supabaseEnabled()) {
    const { readRemoteState } = await import("./remote-service");
    return { ...(await readRemoteState()), mapLinks } as State;
  }
  const { readState } = await import("./service");
  const { readLocalOperations } = await import("./operations-local");
  const extra = readLocalOperations();
  return { ...readState(), ...extra, mapLinks } as State;
}
export async function mutateApplication(
  action: string,
  data: unknown,
  user: User,
) {
  if (action === "maps_company") {
    const { saveMapsCompany } = await import("./maps-crm");
    return saveMapsCompany(data, user);
  }
  if (action === "stage") {
    const d = data as { id: string; status: string; reason?: string };
    action = "stage_confirm";
    data = { company_id: d.id, status: d.status, reason: d.reason || "" };
  }
  if (supabaseEnabled()) {
    const { mutateRemote } = await import("./remote-service");
    return mutateRemote(action, data, user);
  }
  if (Object.hasOwn(operationSchemas, action)) {
    const { mutateLocalOperation } = await import("./operations-local");
    return mutateLocalOperation(action as OperationAction, data, user);
  }
  if (["sale", "order", "stock", "purchase"].includes(action))
    throw new Error(
      "Use venda rápida, conferência de estoque, lote ou atualização de pedido para preservar o histórico.",
    );
  const { mutate } = await import("./service");
  if (
    !operationalRole(user.role) ||
    (["user", "weights"].includes(action) && user.role !== "ADMIN")
  )
    throw new Error("Acesso restrito ao administrador.");
  const result = mutate(action, data, { ...user, role: "ADMIN" });
  if (action === "inventory" && !(data as { id?: string }).id) {
    const { run } = await import("./db");
    run(
      "UPDATE inventory_items SET quantity_known=0 WHERE id=?",
      String(result),
    );
  }
  return result;
}
