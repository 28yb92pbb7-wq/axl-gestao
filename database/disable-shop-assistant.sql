-- Desativa pontos de entrada sem excluir clientes, pedidos, arquivos, vendas ou históricos.
-- Após execução, retorne o deployment Vercel à versão anterior. Para reativar, reaplique a atualização completa.
BEGIN;
REVOKE EXECUTE ON FUNCTION shop_catalog(),shop_state(),shop_mutate(text,jsonb),shop_asset_register(jsonb),axl_maps_save(jsonb) FROM anon,authenticated;
REVOKE EXECUTE ON FUNCTION assistant_register(jsonb),assistant_issue(jsonb),assistant_exchange(jsonb),assistant_identity(text,text),assistant_connections(text),assistant_execute(text,text,text,jsonb) FROM anon,authenticated;
UPDATE assistant_tokens SET revoked=true;
DROP TRIGGER IF EXISTS axl_shop_signup ON auth.users;
-- Guardas de produção, RLS e privacidade dos arquivos são mantidas para proteger pedidos existentes.
COMMIT;
