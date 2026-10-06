"""Gera atualização atômica a partir das migrações v2 revisadas (sem dados privados)."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
parts = []
for name in ["supabase-v2.sql", "supabase-v2-operations.sql"]:
    text = (root / "database" / name).read_text()
    assert "BEGIN;\n" in text and text.rstrip().endswith("COMMIT;")
    parts.append(text.replace("BEGIN;\n", "", 1).rstrip().removesuffix("COMMIT;").rstrip())
(root / "database/update-2026-10-06.sql").write_text("-- Atualização operacional AXL. Aplicar após supabase-import.sql.\n-- Gerado por scripts/build-operational-migration.py. Sem dados pessoais.\nBEGIN;\n" + "\n\n".join(parts) + "\nCOMMIT;\n")
