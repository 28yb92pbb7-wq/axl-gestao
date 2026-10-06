import { dateBR } from "./domain";
import type { Sale } from "./types";
export const costKnown = (sale: Pick<Sale, "cost_known">) =>
  sale.cost_known !== 0;
export const paymentKnown = (sale: Pick<Sale, "payment_known">) =>
  sale.payment_known !== 0;
export const saleDate = (sale: Pick<Sale, "date" | "date_label">) =>
  sale.date_label || (sale.date ? dateBR(sale.date) : "Sem data precisa");
export function saleInPeriod(
  sale: Pick<Sale, "date" | "date_start" | "date_end">,
  start: string,
  end: string,
  all = false,
) {
  if (all) return true;
  if (sale.date) return sale.date >= start && sale.date <= end;
  // Um intervalo só entra no filtro quando inteiro dentro do período.
  return Boolean(
    sale.date_start &&
    sale.date_end &&
    sale.date_start >= start &&
    sale.date_end <= end,
  );
}
