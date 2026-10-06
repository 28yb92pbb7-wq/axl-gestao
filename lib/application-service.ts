import { supabaseEnabled } from "./backend";
import type { User } from "./auth";
export async function readApplicationState() {
  if (supabaseEnabled()) {
    const { readRemoteState } = await import("./remote-service");
    return readRemoteState();
  }
  const { readState } = await import("./service");
  return readState();
}
export async function mutateApplication(
  action: string,
  data: unknown,
  user: User,
) {
  if (supabaseEnabled()) {
    const { mutateRemote } = await import("./remote-service");
    return mutateRemote(action, data, user);
  }
  const { mutate } = await import("./service");
  return mutate(action, data, user);
}
