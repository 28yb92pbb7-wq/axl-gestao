"use client";
import { useState } from "react";
import type { GooglePlace } from "@/lib/google-places";
import type { State } from "@/lib/types";
import type { Mutate } from "./ui";
export default function MapsImportForm({
  state,
  mutate,
  onSaved,
  personalization,
  onSelect,
}: {
  state?: State;
  mutate?: Mutate;
  onSaved?: (id: string, place?: GooglePlace) => void;
  personalization?: boolean;
  onSelect?: (v: { url: string; place_id?: string }) => void;
}) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<
    { token: string; place: GooglePlace }[]
  >([]);
  const [selected, setSelected] = useState<{
    token: string;
    place: GooglePlace;
  }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [associate, setAssociate] = useState("");
  const [distinct, setDistinct] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  async function lookup(chosen?: string, manual = false) {
    setBusy(true);
    setMessage("");
    setSelected(undefined);
    setCandidates([]);
    setConfirmed(false);
    try {
      const r = await fetch("/api/maps/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, url: chosen, name, city, manual }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setUrls(d.urls || []);
      setUrl(d.identity?.url || chosen || "");
      setCandidates(d.candidates || []);
      setMessage(d.message || "Selecione um link.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const duplicate =
    selected && state?.companies.find((c) => c.place_id === selected.place.id);
  return (
    <section className="settings-card">
      <p>
        Google Maps → ficha da empresa → Compartilhar → Copiar link. Cole
        abaixo. Rotas e buscas genéricas não identificam uma empresa.
      </p>
      <label>
        Cole o link da empresa no Google Maps
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setUrl("");
            setSelected(undefined);
            setCandidates([]);
            setConfirmed(false);
          }}
        />
      </label>
      <div className="form-grid">
        <label>
          Nome e cidade para identificar candidatos (opcionais)
          <input
            aria-label="Nome complementar"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Cidade complementar
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
      </div>
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={() => lookup()}
      >
        {busy ? "Buscando…" : "Buscar dados"}
      </button>
      <button
        className="secondary"
        type="button"
        disabled={busy}
        onClick={() => lookup(undefined, true)}
      >
        Preencher manualmente com este link
      </button>
      {urls.map((u) => (
        <button
          type="button"
          className="text-button"
          key={u}
          onClick={() => lookup(u)}
        >
          {u}
        </button>
      ))}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {candidates.map((c) => (
        <button
          key={c.token}
          className="secondary"
          type="button"
          onClick={() => {
            setSelected(c);
            setConfirmed(false);
          }}
        >
          {c.place.displayName.text} ·{" "}
          {c.place.formattedAddress || "endereço não informado"}
        </button>
      ))}
      {selected && (
        <section>
          <h3>{selected.place.displayName.text}</h3>
          <p>{selected.place.formattedAddress}</p>
          <p>
            Categoria:{" "}
            {selected.place.primaryTypeDisplayName?.text || "não informada"} ·
            Funcionamento: {selected.place.businessStatus || "não informado"}
          </p>
          <p>
            Cidade/bairro:{" "}
            {selected.place.addressComponents
              ?.filter((c) =>
                c.types.some((t) =>
                  [
                    "locality",
                    "administrative_area_level_2",
                    "sublocality_level_1",
                    "sublocality",
                  ].includes(t),
                ),
              )
              .map((c) => c.longText)
              .join(" · ") || "não informados"}
          </p>
          <p>
            Nota {selected.place.rating ?? "não disponível"} ·{" "}
            {selected.place.userRatingCount ?? "não informado"} avaliações
          </p>
          <p>
            Telefone público:{" "}
            {selected.place.nationalPhoneNumber || "não publicado"} (WhatsApp
            não confirmado)
          </p>
          <p>Site: {selected.place.websiteUri || "não publicado"}</p>
          {selected.place.regularOpeningHours?.weekdayDescriptions?.map((h) => (
            <p key={h}>{h}</p>
          ))}
          <p className="google-attribution">
            Google Maps · dados consultados agora, disponíveis nesta prévia por
            15 minutos.
          </p>
          {selected.place.attributions?.map((a) => (
            <a
              key={a.provider}
              href={a.providerUri}
              target="_blank"
              rel="noreferrer"
            >
              {a.provider}
            </a>
          ))}
        </section>
      )}
      {url && (
        <>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Abrir no Google Maps
          </a>
          <label className="route-choice">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            Confirmei que o link corresponde à empresa correta
          </label>
          {personalization ? (
            <button
              type="button"
              className="primary"
              disabled={!confirmed}
              onClick={() => onSelect?.({ url, place_id: selected?.place.id })}
            >
              Usar link na personalização
            </button>
          ) : (
            <>
              <p>
                Os campos abaixo são dados próprios, fornecidos pela empresa. A
                prévia Google não é copiada automaticamente para uma base
                permanente.
              </p>
              {duplicate && (
                <p className="notice">
                  Empresa já cadastrada: {duplicate.name}. Salvar abrirá essa
                  ficha.
                </p>
              )}
              <label>
                Associar a uma ficha existente (opcional)
                <select
                  value={associate}
                  onChange={(e) => setAssociate(e.target.value)}
                >
                  <option value="">Criar lead mínimo</option>
                  {state?.companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.city}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy || !confirmed) return;
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  try {
                    const r = await fetch("/api/data", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "maps_company",
                        data: {
                          url,
                          token: selected?.token,
                          company_id: associate || undefined,
                          new_homonym: distinct,
                          fields: {
                            name: f.get("name"),
                            city: f.get("city") || "",
                            phone: f.get("phone") || "",
                            address: f.get("address") || "",
                            segment: f.get("segment") || "Outros",
                            notes: f.get("notes") || "",
                          },
                        },
                      }),
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error);
                    await mutate?.("__refresh", {});
                    onSaved?.(d.result.id, selected?.place);
                    setMessage(
                      d.result.existing
                        ? "Ficha existente aberta; nenhuma duplicata criada."
                        : "Lead salvo.",
                    );
                  } catch (err) {
                    setMessage((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="form-grid">
                  <label>
                    Nome próprio do cadastro
                    <input
                      name="name"
                      required
                      minLength={2}
                      defaultValue={
                        associate
                          ? state?.companies.find((c) => c.id === associate)
                              ?.name
                          : undefined
                      }
                    />
                  </label>
                  <label>
                    Cidade informada pela empresa
                    <input name="city" />
                  </label>
                  <label>
                    Telefone informado pela empresa
                    <input name="phone" />
                  </label>
                  <label>
                    Endereço próprio
                    <input name="address" />
                  </label>
                  <label>
                    Segmento
                    <input name="segment" />
                  </label>
                  <label>
                    Observações próprias
                    <textarea name="notes" />
                  </label>
                </div>
                <label className="route-choice">
                  <input
                    type="checkbox"
                    checked={distinct}
                    onChange={(e) => setDistinct(e.target.checked)}
                  />
                  Se houver homônimo, confirmo que é uma empresa distinta
                </label>
                <button disabled={!confirmed || busy} className="primary">
                  {associate
                    ? "Associar a cliente existente"
                    : "Salvar como lead / usar nesta venda"}
                </button>
              </form>
            </>
          )}
        </>
      )}
    </section>
  );
}
