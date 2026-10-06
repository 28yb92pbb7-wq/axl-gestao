"use client";
import { useState } from "react";
import {
  X,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
export type Field = {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "money"
    | "date"
    | "datetime-local"
    | "textarea"
    | "select"
    | "checkbox";
  value?: string | number | boolean | null;
  required?: boolean;
  nullable?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
};
export type Mutate = (action: string, data: unknown) => Promise<void>;
export function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function ActionForm({
  fields,
  action,
  mutate,
  extra = {},
  close,
  submit = "Salvar",
}: {
  fields: Field[];
  action: string;
  mutate: Mutate;
  extra?: Record<string, unknown>;
  close: () => void;
  submit?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const form = new FormData(e.currentTarget);
        const data: Record<string, unknown> = { ...extra };
        for (const f of fields) {
          const value = form.get(f.name);
          data[f.name] =
            f.type === "checkbox"
              ? value === "on"
              : f.type === "money"
                ? Math.round(Number(value) * 100)
                : f.type === "number"
                  ? Number(value)
                  : f.nullable && value === ""
                    ? null
                    : value;
        }
        try {
          await mutate(action, data);
          close();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Não foi possível salvar.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="form-grid">
        {fields.map((f) => (
          <label key={f.name} className={f.type === "textarea" ? "span-2" : ""}>
            {f.label}
            {f.type === "select" ? (
              <select
                name={f.name}
                defaultValue={String(f.value ?? "")}
                required={f.required}
              >
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : f.type === "textarea" ? (
              <textarea
                name={f.name}
                defaultValue={String(f.value ?? "")}
                rows={3}
              />
            ) : f.type === "checkbox" ? (
              <input name={f.name} type="checkbox" defaultChecked={!!f.value} />
            ) : (
              <input
                name={f.name}
                type={f.type === "money" ? "number" : f.type || "text"}
                autoComplete={
                  f.type === "password" ? "new-password" : undefined
                }
                defaultValue={
                  f.type === "money"
                    ? Number(f.value || 0) / 100
                    : String(f.value ?? "")
                }
                step={
                  f.type === "money"
                    ? "0.01"
                    : f.type === "number"
                      ? "any"
                      : undefined
                }
                required={f.required}
              />
            )}{" "}
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}
      </div>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <button type="button" className="secondary" onClick={close}>
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : submit}
        </button>
      </footer>
    </form>
  );
}
export function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  text = "Nenhum registro encontrado.",
}: {
  text?: string;
}) {
  return (
    <div className="empty">
      <Search size={24} />
      <p>{text}</p>
    </div>
  );
}
export type Column<T> = {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
};
export function exportCSV(rows: Record<string, unknown>[], filename: string) {
  const keys = Object.keys(rows[0] || {});
  const cell = (value: unknown) => {
    const s = String(value ?? "");
    return (
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replaceAll('"', '""') + '"'
    );
  };
  const blob = new Blob(
    [
      "\uFEFF" +
        [
          keys.map(cell).join(";"),
          ...rows.map((r) => keys.map((k) => cell(r[k])).join(";")),
        ].join("\r\n"),
    ],
    { type: "text/csv;charset=utf-8;" },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function Table<T extends { id: string }>({
  rows,
  columns,
  onRow,
  filename,
}: {
  rows: T[];
  columns: Column<T>[];
  onRow?: (row: T) => void;
  filename?: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("");
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(1);
  const filtered = rows.filter((r) =>
    JSON.stringify(r)
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")),
  );
  filtered.sort((a, b) => {
    const av = (a as Record<string, unknown>)[sort],
      bv = (b as Record<string, unknown>)[sort];
    const compare =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""), "pt-BR");
    return desc ? -compare : compare;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 8));
  const current = Math.min(page, pages);
  return (
    <div className="panel table-panel">
      <div className="table-toolbar">
        <div className="search-input">
          <Search size={16} />
          <input
            aria-label="Pesquisar na tabela"
            placeholder="Pesquisar registros…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <span className="muted">{filtered.length} registros</span>
        {filename && (
          <button
            className="secondary"
            onClick={() =>
              exportCSV(
                filtered as unknown as Record<string, unknown>[],
                filename,
              )
            }
          >
            <Download size={15} /> CSV
          </button>
        )}
      </div>
      {!filtered.length ? (
        <Empty />
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>
                    <button
                      onClick={() => {
                        setSort(c.key);
                        setDesc(sort === c.key ? !desc : false);
                      }}
                    >
                      {c.label}
                      <ArrowUpDown size={12} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice((current - 1) * 8, current * 8).map((row) => (
                <tr key={row.id}>
                  {columns.map((c, index) => (
                    <td key={c.key}>
                      {index === 0 && onRow ? (
                        <button
                          className="text-button"
                          onClick={() => onRow(row)}
                        >
                          {c.render
                            ? c.render(row)
                            : String(
                                (row as Record<string, unknown>)[c.key] ?? "",
                              )}
                        </button>
                      ) : c.render ? (
                        c.render(row)
                      ) : (
                        String((row as Record<string, unknown>)[c.key] ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <span>
          Página {current} de {pages}
        </span>
        <button
          className="icon-button"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          className="icon-button"
          disabled={current >= pages}
          onClick={() => setPage(current + 1)}
          aria-label="Próxima página"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
