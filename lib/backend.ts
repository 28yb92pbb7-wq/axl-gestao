export function supabaseEnabled() {
  const backend = process.env.AXL_BACKEND || "local";
  if (!["local", "supabase"].includes(backend))
    throw new Error("AXL_BACKEND deve ser local ou supabase.");
  return backend === "supabase";
}
