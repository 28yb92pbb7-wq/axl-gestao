import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import type { User } from "./auth";
import { supabaseEnabled } from "./backend";
import { supabaseServer } from "./integrations/supabase-server";
import { shopState } from "./shop-service";
import { initShop } from "./shop-local";
import { one, insert, run, transaction } from "./db";
export function fileFormat(bytes: Uint8Array, mime: string) {
  const b = Buffer.from(bytes);
  const valid =
    (mime === "image/png" &&
      b
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255) ||
    (mime === "image/webp" &&
      b.subarray(0, 4).toString() === "RIFF" &&
      b.subarray(8, 12).toString() === "WEBP") ||
    (mime === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-");
  if (!valid)
    throw new Error(
      "Formato real do arquivo não corresponde a PNG, JPG, WebP ou PDF.",
    );
  return (
    {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "application/pdf": "pdf",
    } as Record<string, string>
  )[mime];
}
export async function saveShopAsset(
  user: User,
  orderId: string,
  kind: string,
  file: File,
) {
  const state = await shopState(user);
  const order = state.orders.find((o) => o.id === orderId);
  if (
    !order ||
    !["art", "logo", "proof"].includes(kind) ||
    (kind === "art" && user.role !== "ADMIN")
  )
    throw new Error("Pedido/arquivo não autorizado.");
  if (file.size <= 0 || file.size > 4 * 1024 * 1024)
    throw new Error("O arquivo deve ter entre 1 byte e 4 MB.");
  if (order.status === "Cancelado") throw new Error("Pedido cancelado.");
  const bytes = new Uint8Array(await file.arrayBuffer()),
    extension = fileFormat(bytes, file.type);
  const filename = file.name.replace(/[^\p{L}\p{N}._ -]/gu, "_").slice(0, 150);
  const key = `shop/${orderId}/${randomUUID()}.${extension}`;
  if (supabaseEnabled()) {
    const c = await supabaseServer();
    const { error } = await c.storage
      .from("axl-files")
      .upload(key, bytes, { contentType: file.type, upsert: false });
    if (error)
      throw new Error("Falha ao enviar arquivo ao armazenamento privado.");
    const { data, error: registration } = await c.rpc("shop_asset_register", {
      d: {
        order_id: orderId,
        kind,
        filename,
        mime: file.type,
        storage_path: key,
      },
    });
    if (registration) {
      await c.storage.from("axl-files").remove([key]);
      throw new Error(
        registration.code === "P0001"
          ? registration.message
          : "Não foi possível vincular o arquivo ao pedido.",
      );
    }
    return { id: data };
  }
  initShop();
  const target = path.resolve(".data", key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, bytes, { mode: 0o600 });
  try {
    return transaction(() => {
      const version =
        (one<{ v: number }>(
          "SELECT MAX(version) v FROM shop_assets WHERE order_id=? AND kind=?",
          orderId,
          kind,
        )?.v || 0) + 1;
      const id = insert("shop_assets", {
        order_id: orderId,
        user_id: user.id,
        kind,
        version,
        filename,
        mime: file.type,
        storage_path: key,
      });
      if (kind === "art") {
        if (
          order.production_order_id &&
          one<{ produced_at: string }>(
            "SELECT produced_at FROM orders WHERE id=?",
            order.production_order_id,
          )?.produced_at
        )
          throw new Error("Produção já iniciada; solicite alteração formal.");
        order.data.art_approved = false;
        run(
          "UPDATE shop_orders SET data=? WHERE id=?",
          JSON.stringify(order.data),
          orderId,
        );
        if (order.production_order_id)
          run(
            "UPDATE orders SET status='Aguardando aprovação' WHERE id=?",
            order.production_order_id,
          );
      }
      insert("shop_events", {
        order_id: orderId,
        user_id: user.id,
        type:
          kind === "proof"
            ? "Comprovante enviado — conciliação pendente"
            : kind === "art"
              ? "Nova versão da arte"
              : "Logo enviado",
        details: "{}",
      });
      return { id };
    });
  } catch (e) {
    await unlink(target);
    throw e;
  }
}
export async function readShopAsset(user: User, id: string) {
  if (supabaseEnabled()) {
    const c = await supabaseServer();
    const { data, error } = await c
      .from("shop_assets")
      .select("storage_path,mime,filename")
      .eq("id", id)
      .single();
    if (error || !data) throw new Error("Arquivo não encontrado.");
    const { data: blob, error: download } = await c.storage
      .from("axl-files")
      .download(data.storage_path);
    if (download || !blob) throw new Error("Não foi possível abrir o arquivo.");
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mime: data.mime,
      filename: data.filename,
    };
  }
  initShop();
  const row = one<{
    storage_path: string;
    mime: string;
    filename: string;
    buyer_id: string;
  }>(
    "SELECT a.*,o.buyer_id FROM shop_assets a JOIN shop_orders o ON o.id=a.order_id WHERE a.id=?",
    id,
  );
  if (!row || (user.role !== "ADMIN" && row.buyer_id !== user.id))
    throw new Error("Arquivo não encontrado.");
  return {
    bytes: new Uint8Array(
      await readFile(path.resolve(".data", row.storage_path)),
    ),
    mime: row.mime,
    filename: row.filename,
  };
}
