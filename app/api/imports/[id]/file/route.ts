import { currentUser } from "@/lib/auth";
import { supabaseEnabled } from "@/lib/backend";
import { supabaseServer } from "@/lib/integrations/supabase-server";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user || user.role !== "ADMIN")
    return new Response("Acesso restrito.", { status: 401 });
  const { id } = await context.params;
  if (!supabaseEnabled() || !/^[a-f0-9]{64}$/.test(id))
    return new Response("Arquivo não encontrado.", { status: 404 });
  const client = await supabaseServer();
  const { data, error } = await client
    .from("settings")
    .select("value")
    .eq("key", "workbook:" + id)
    .single();
  if (error || !data?.value?.file_base64)
    return new Response("Arquivo não encontrado.", { status: 404 });
  const name = String(data.value.filename).replace(/[\r\n"\\/]/g, "_");
  return new Response(Buffer.from(data.value.file_base64, "base64"), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":
        "attachment; filename*=UTF-8''" + encodeURIComponent(name),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
