from pathlib import Path
root=Path(__file__).resolve().parents[1]
parts=[]
for name in ['update-2026-10-06.sql','update-links-shop.sql','update-assistant.sql']:
    s=(root/'database'/name).read_text()
    assert '\nBEGIN;\n' in s and s.rstrip().endswith('COMMIT;')
    parts.append(s.replace('\nBEGIN;\n','\n',1).rstrip().removesuffix('COMMIT;').rstrip())
(root/'database/update-2026-10-06-completo.sql').write_text('-- AXL: atualização completa, aditiva e atômica. Não reimporta vendas.\nBEGIN;\n'+'\n\n'.join(parts)+'\nCOMMIT;\n')
