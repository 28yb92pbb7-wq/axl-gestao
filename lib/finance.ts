import type { State } from "./types";
import { costKnown, paymentKnown } from "./history";
export function financeSummary(state: State) {
  const opening = state.cash
    ?.filter((c) => c.type === "opening")
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const cutoff = opening?.date || "";
  const receipts = state.payments
    .filter((p) => p.date >= cutoff)
    .reduce((s, p) => s + p.amount, 0);
  const spending = state.expenses
    .filter((e) => e.paid && e.date >= cutoff)
    .reduce((s, e) => s + e.amount, 0);
  const investment = (state.lotPayments || [])
    .filter((p) => p.date >= cutoff)
    .reduce((s, p) => s + p.amount, 0);
  const flows = (state.cash || [])
    .filter((c) => c.type !== "opening" && c.date >= cutoff)
    .reduce((s, c) => s + (c.type === "withdrawal" ? -c.amount : c.amount), 0);
  const revenue = state.sales.reduce((s, v) => s + v.total, 0);
  const confirmed = state.payments.reduce((s, p) => s + p.amount, 0);
  const balance = state.sales
    .filter(paymentKnown)
    .reduce((s, v) => s + v.total - v.paid, 0);
  const unknown = state.sales
    .filter((s) => !paymentKnown(s))
    .reduce((s, v) => s + v.total, 0);
  const gross = state.sales.filter(costKnown).reduce((s, v) => s + v.profit, 0);
  return {
    opening,
    revenue,
    confirmed,
    balance,
    unknown,
    gross,
    grossKnown: state.sales.some(costKnown),
    investment,
    cash: opening
      ? opening.amount + receipts - spending - investment + flows
      : null,
    partialFlow: receipts - spending - investment + flows,
    partial: state.sales.some(
      (s) => !costKnown(s) || s.cost_status === "estimated",
    ),
  };
}
