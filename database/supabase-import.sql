-- Histórico da planilha: aplicar depois das três migrações iniciais.
-- Não recalcula custos, pagamentos ou estoque do passado.
BEGIN;
ALTER TABLE public.sales ALTER COLUMN date DROP NOT NULL;
ALTER TABLE public.sales ALTER COLUMN due_date DROP NOT NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS date_label text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS date_start date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS date_end date;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS import_key text UNIQUE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS import_source text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS source_row jsonb;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cost_known boolean NOT NULL DEFAULT true;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS payment_known boolean NOT NULL DEFAULT true;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cost_known boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.axl_import_history(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE r jsonb; cid uuid; pid uuid; sid uuid; candidates integer; n integer := 0; skipped integer := 0;
qty integer; amount integer; base integer; remainder integer; total_amount bigint := 0; total_plates integer := 0;
file_hash text := p_payload->>'sha256'; row_key text; sku_value text;
BEGIN
IF NOT public.is_axl_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador.'; END IF;
IF file_hash IS NULL OR file_hash !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'rows') NOT BETWEEN 1 AND 1000 OR octet_length(p_payload::text)>2000000 THEN RAISE EXCEPTION 'Arquivo de importação inválido.'; END IF;
PERFORM pg_advisory_xact_lock(184771);
FOR r IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
qty := (r->>'plates')::integer; amount := (r->>'total')::integer; row_key := r->>'key';
IF row_key IS NULL OR row_key !~ '^[a-f0-9]{64}$' OR qty IS NULL OR qty NOT BETWEEN 1 AND 10000 OR amount IS NULL OR amount NOT BETWEEN 1 AND 100000000 OR length(btrim(COALESCE(r->>'company',''))) NOT BETWEEN 2 AND 160 OR length(COALESCE(r->>'solution','')) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'Linha inválida na importação.'; END IF;
IF COALESCE(r->>'date','')<>'' AND (COALESCE(r->>'date_start','')<>r->>'date' OR COALESCE(r->>'date_end','')<>r->>'date') THEN RAISE EXCEPTION 'Data inconsistente.'; END IF;
IF COALESCE(r->>'date_start','')<>'' AND ((r->>'date_start')::date>(r->>'date_end')::date) THEN RAISE EXCEPTION 'Período inválido.'; END IF;
total_amount := total_amount + amount; total_plates := total_plates + qty;
IF EXISTS(SELECT 1 FROM public.sales WHERE import_key=row_key) THEN skipped := skipped+1; CONTINUE; END IF;
SELECT count(*) INTO candidates FROM public.companies WHERE deleted_at IS NULL AND lower(btrim(name))=lower(btrim(r->>'company'));
IF candidates>1 THEN RAISE EXCEPTION 'Há mais de um cadastro para %. Revise antes de importar.',r->>'company'; END IF;
SELECT id INTO cid FROM public.companies WHERE deleted_at IS NULL AND lower(btrim(name))=lower(btrim(r->>'company'));
IF cid IS NULL THEN
INSERT INTO public.companies(name,city,state,segment,origin,notes,is_customer,is_lead,status) VALUES(r->>'company','','',r->>'segment','Planilha AXL',COALESCE(r->>'notes',''),true,false,'Venda') RETURNING id INTO cid;
ELSE UPDATE public.companies SET is_customer=true WHERE id=cid;
END IF;
sku_value := 'HIST-'||substr(md5(r->>'solution'),1,24);
SELECT id INTO pid FROM public.products WHERE sku=sku_value;
IF pid IS NULL THEN
INSERT INTO public.products(name,sku,category,description,price,cost,cost_known,active,is_plate,controls_stock) VALUES(r->>'solution',sku_value,'Histórico importado','Descrição original da planilha. Produto histórico inativo: preços e custos futuros precisam de cadastro próprio.',0,0,false,false,true,false) RETURNING id INTO pid;
END IF;
INSERT INTO public.sales(company_id,date,total,cost,profit,margin,plates,method,due_date,notes,commission,commission_rule,date_label,date_start,date_end,import_key,import_source,source_row,cost_known,payment_known)
VALUES(cid,NULLIF(r->>'date','')::date,amount,0,0,0,qty,'Não informado',NULL,concat_ws(E'\n',NULLIF(r->>'notes',''),'Solução: '||(r->>'solution'),'Importado da planilha. Custos, comissão, pagamentos e entrega não informados. Valores unitários dos itens são rateio contábil do total; não comprovam preço de cada placa.'),0,'{}',r->>'date_label',NULLIF(r->>'date_start','')::date,NULLIF(r->>'date_end','')::date,row_key,p_payload->>'filename',r,false,false) RETURNING id INTO sid;
-- Rateio exato em centavos; preserva total e quantidade mesmo quando a média é arredondada.
base := amount/qty; remainder := amount%qty;
IF qty-remainder>0 THEN INSERT INTO public.sale_items(sale_id,product_id,product_name,quantity,price,cost,is_plate,margin,components_snapshot) VALUES(sid,pid,r->>'solution',qty-remainder,base,0,true,0,'[]'); END IF;
IF remainder>0 THEN INSERT INTO public.sale_items(sale_id,product_id,product_name,quantity,price,cost,is_plate,margin,components_snapshot) VALUES(sid,pid,r->>'solution',remainder,base+1,0,true,0,'[]'); END IF;
INSERT INTO public.activities(company_id,user_id,type,description) VALUES(cid,auth.uid(),'Importação de histórico',concat_ws(E'\n',r->>'date_label',(r->>'solution'),'Total em centavos: '||amount,'Placas: '||qty,NULLIF(r->>'notes','')));
n := n+1;
END LOOP;
IF total_amount IS DISTINCT FROM (p_payload->>'total')::bigint OR total_plates IS DISTINCT FROM (p_payload->>'plates')::integer OR jsonb_array_length(p_payload->'rows') IS DISTINCT FROM (p_payload->>'count')::integer THEN RAISE EXCEPTION 'Totais não conferem. Nenhum registro foi importado.'; END IF;
INSERT INTO public.settings(key,value) VALUES('workbook:'||file_hash,jsonb_build_object('filename',p_payload->>'filename','sha256',file_hash,'count',p_payload->'count','plates',p_payload->'plates','total',p_payload->'total','sheets',p_payload->'sheets','file_base64',p_payload->>'file_base64','imported_at',now())) ON CONFLICT(key) DO NOTHING;
PERFORM public.axl_audit('Importação de planilha AXL',NULL,'historical_import');
RETURN jsonb_build_object('imported',n,'skipped',skipped,'sales',jsonb_array_length(p_payload->'rows'),'plates',total_plates,'total',total_amount);
END $$;
REVOKE ALL ON FUNCTION public.axl_import_history(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.axl_import_history(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.axl_validate_historical_payment() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
IF EXISTS(SELECT 1 FROM public.sales WHERE id=NEW.sale_id AND NOT payment_known) THEN RAISE EXCEPTION 'Pagamento histórico não informado. Concilie a situação original antes de registrar recebimentos.'; END IF;
RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_historical_payment ON public.payments;
CREATE TRIGGER validate_historical_payment BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.axl_validate_historical_payment();
COMMIT;
