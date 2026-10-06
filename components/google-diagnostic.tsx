"use client";
import MapsImportForm from "./maps-import-form";
export default function GoogleDiagnostic() {
  return (
    <section className="panel settings-card">
      <h3>Testar importação por link</h3>
      <p>
        Places API (New) usa GOOGLE_PLACES_API_KEY no servidor. Sem credencial,
        salve o link e preencha manualmente. Não é necessária uma chave Maps
        Embed ou JavaScript.
      </p>
      <MapsImportForm personalization onSelect={() => {}} />
    </section>
  );
}
