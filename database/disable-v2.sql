-- Desativação sem apagar dados. Executar SOMENTE ao voltar à versão anterior.
-- Antes, restaure as funções de supabase-runtime.sql e supabase-state.sql
-- (esses arquivos contêm apenas funções e permissões; não apagam vendas).
BEGIN;
REVOKE EXECUTE ON FUNCTION public.axl_ops(text,jsonb),public.axl_state_v2() FROM authenticated;
DO $$ DECLARE p record;BEGIN FOR p IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND policyname IN('members','members_read') LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);END LOOP;END $$;
DROP TRIGGER IF EXISTS axl_contact_stage_guard ON public.companies;
COMMIT;
-- Tabelas/colunas v2 e registros ficam preservados. Para reativar, aplicar
-- update-2026-10-06.sql e publicar novamente o código atualizado.
