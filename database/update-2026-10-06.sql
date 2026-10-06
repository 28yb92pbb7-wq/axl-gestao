-- Atualização operacional AXL. Aplicar após supabase-import.sql.
-- Gerado por scripts/build-operational-migration.py. Sem dados pessoais.
BEGIN;
-- AXL rua v2: migração aditiva. Aplicar após supabase-import.sql. Não apaga histórico.
CREATE OR REPLACE FUNCTION public.is_axl_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN('ADMIN','VENDEDOR')) $$;
REVOKE ALL ON FUNCTION public.is_axl_member() FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.is_axl_member() TO authenticated;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS request_id uuid UNIQUE;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS revenue_allocated boolean NOT NULL DEFAULT true;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS seller_lat numeric;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS seller_lng numeric;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS unit_cost_precise numeric;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS cost_total integer;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS cost_origin text;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS line_total integer;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS revenue_known boolean NOT NULL DEFAULT true;
ALTER TABLE public.sale_items ADD COLUMN IF NOT EXISTS discount integer NOT NULL DEFAULT 0;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS quantity_known boolean NOT NULL DEFAULT true;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS cost_status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS cost_origin text;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'material';
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS stock_confirmed_at date;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'physical';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_inventory_id uuid REFERENCES public.inventory_items(id);
ALTER TABLE public.orders ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS responsible_id uuid REFERENCES public.profiles(id);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS item_snapshot jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_reason text;
CREATE TABLE IF NOT EXISTS public.inventory_lots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inventory_id uuid NOT NULL REFERENCES public.inventory_items(id),code text NOT NULL,quantity numeric NOT NULL CHECK(quantity>0),amount integer NOT NULL CHECK(amount>=0),freight integer NOT NULL DEFAULT 0 CHECK(freight>=0),unit_cost numeric NOT NULL,received numeric NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=quantity),purchase_date date,receipt_date date,supplier text,paid integer NOT NULL DEFAULT 0 CHECK(paid>=0),paid_known boolean NOT NULL DEFAULT false,financial_date date,receipt_status text NOT NULL DEFAULT 'unknown',source_key text UNIQUE,as_of date,notes text,user_id uuid REFERENCES public.profiles(id),created_at timestamptz DEFAULT now(),UNIQUE(inventory_id,code));
CREATE TABLE IF NOT EXISTS public.lot_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),lot_id uuid NOT NULL REFERENCES public.inventory_lots(id),amount integer NOT NULL CHECK(amount>0),date date NOT NULL,user_id uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.inventory_counts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),inventory_id uuid NOT NULL REFERENCES public.inventory_items(id),previous_quantity numeric,quantity numeric NOT NULL CHECK(quantity>=0),date date NOT NULL,initial boolean NOT NULL DEFAULT false,notes text NOT NULL,user_id uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.inventory_reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id),inventory_id uuid NOT NULL REFERENCES public.inventory_items(id),quantity numeric NOT NULL CHECK(quantity>0),status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','released','consumed')),created_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS reservation_active_unique ON public.inventory_reservations(order_id,inventory_id) WHERE status='reserved';
CREATE TABLE IF NOT EXISTS public.cash_entries(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),type text NOT NULL CHECK(type IN('opening','contribution','withdrawal')),amount integer NOT NULL CHECK(amount>=0),date date NOT NULL,notes text,user_id uuid NOT NULL REFERENCES public.profiles(id),created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.contact_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),user_id uuid NOT NULL REFERENCES public.profiles(id),type text NOT NULL,phone text,text text,result text,next_at text,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.order_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid NOT NULL REFERENCES public.orders(id),user_id uuid NOT NULL REFERENCES public.profiles(id),type text NOT NULL,notes text,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS public.proposals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),company_id uuid NOT NULL REFERENCES public.companies(id),user_id uuid NOT NULL REFERENCES public.profiles(id),text text NOT NULL,amount integer,status text NOT NULL DEFAULT 'Rascunho',created_at timestamptz DEFAULT now());
DO $$ DECLARE t text;BEGIN
FOREACH t IN ARRAY ARRAY['lot_payments','inventory_lots','inventory_counts','inventory_reservations','cash_entries','contact_events','order_events','proposals'] LOOP
EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='members') THEN EXECUTE format('CREATE POLICY members ON public.%I FOR ALL TO authenticated USING(public.is_axl_member()) WITH CHECK(public.is_axl_member())',t); END IF;
EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
END LOOP;
FOREACH t IN ARRAY ARRAY['salespeople','companies','leads','customers','contacts','activities','followups','inventory_items','products','product_components','sales','sale_items','payments','orders','order_items','production_tasks','inventory_movements','purchases','purchase_items','expenses','commissions','goals','routes','route_stops','audit_logs'] LOOP
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='members') THEN EXECUTE format('CREATE POLICY members ON public.%I FOR ALL TO authenticated USING(public.is_axl_member()) WITH CHECK(public.is_axl_member())',t); END IF;
END LOOP;
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='profiles' AND policyname='members_read') THEN CREATE POLICY members_read ON public.profiles FOR SELECT TO authenticated USING(public.is_axl_member());END IF;
IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='settings' AND policyname='members_read') THEN CREATE POLICY members_read ON public.settings FOR SELECT TO authenticated USING(public.is_axl_member());END IF;
END $$;
-- Mantém gestão de usuários/configuração/importação restrita ao ADMIN.
DO $$ DECLARE f regprocedure;definition text;BEGIN
FOREACH f IN ARRAY ARRAY['public.axl_state()'::regprocedure,'public.axl_mutate(text,jsonb)'::regprocedure,'public.axl_audit(text,uuid,text)'::regprocedure,'public.axl_activity(uuid,text,text)'::regprocedure] LOOP
definition:=pg_get_functiondef(f);definition:=replace(definition,'IF NOT public.is_axl_admin()','IF NOT public.is_axl_member()');IF f='public.axl_mutate(text,jsonb)'::regprocedure THEN definition:=replace(definition,'IF NOT public.is_axl_member() THEN', 'IF p_action=''weights'' AND NOT public.is_axl_admin() THEN RAISE EXCEPTION ''Configuração restrita ao administrador.''; END IF; IF NOT public.is_axl_member() THEN');END IF;EXECUTE definition;
END LOOP;
END $$;
UPDATE products SET kind='service' WHERE controls_stock=false AND category IN('Serviços digitais','Consultoria','Serviços');
-- Parâmetros atuais informados, sem confirmar estoque físico ou NFC estimado.
INSERT INTO public.inventory_items(name,unit,quantity,minimum,cost,quantity_known,cost_status,cost_origin) SELECT 'Base/acrílico — referência atual','un',0,0,340,false,'confirmed','Alex informou R$3,40 em 06/10/2026. Interpretação provisória: somente base.' WHERE NOT EXISTS(SELECT 1 FROM inventory_items WHERE name='Base/acrílico — referência atual');
INSERT INTO public.inventory_items(name,unit,quantity,minimum,cost,quantity_known,cost_status,cost_origin) SELECT 'Adesivo impresso — referência atual','un',0,0,83,false,'confirmed','Alex informou R$0,83 por unidade em 06/10/2026.' WHERE NOT EXISTS(SELECT 1 FROM inventory_items WHERE name='Adesivo impresso — referência atual');
INSERT INTO public.inventory_items(name,unit,quantity,minimum,cost,quantity_known,cost_status,cost_origin) SELECT 'Etiqueta NFC — referência provisória','un',0,0,79,false,'estimated','R$0,79 é estimativa provisória; escolha lote real quando conhecido.' WHERE NOT EXISTS(SELECT 1 FROM inventory_items WHERE name='Etiqueta NFC — referência provisória');
INSERT INTO public.products(name,sku,category,description,price,cost,is_plate,controls_stock,uses_nfc,uses_acrylic,kind)
VALUES('Placa Google NFC/QR','AXL-GOOGLE','Placas','Base + adesivo + NFC. Material estimado; não inclui demais custos.',6000,502,true,true,true,true,'physical'),('Placa WhatsApp NFC/QR','AXL-WHATSAPP','Placas','Base + adesivo + NFC.',6000,502,true,true,true,true,'physical'),('Placa Instagram NFC/QR','AXL-INSTAGRAM','Placas','Base + adesivo + NFC.',6000,502,true,true,true,true,'physical'),('Placa Pix somente QR','AXL-PIX-QR','Placas','Base + adesivo, sem NFC.',1500,423,true,true,false,true,'physical'),('Adesivo NFC de mesa','AXL-MESA','Adesivos','Adesivo + NFC, sem acrílico.',0,162,false,true,true,false,'physical'),('Serviço digital','AXL-DIGITAL','Serviços','Custo de serviço informado separadamente; não consome materiais.',0,0,false,false,false,false,'service') ON CONFLICT(sku) DO NOTHING;
INSERT INTO public.product_components(product_id,inventory_id,quantity)
SELECT p.id,i.id,1 FROM products p JOIN inventory_items i ON (p.uses_acrylic AND i.name='Base/acrílico — referência atual') OR (p.sku LIKE 'AXL-%' AND p.kind='physical' AND i.name='Adesivo impresso — referência atual') OR (p.uses_nfc AND i.name='Etiqueta NFC — referência provisória') WHERE p.sku IN('AXL-GOOGLE','AXL-WHATSAPP','AXL-INSTAGRAM','AXL-PIX-QR','AXL-MESA') ON CONFLICT(product_id,inventory_id) DO NOTHING;
-- Lotes históricos são referências para revisão, sem entrada de estoque ou saída de caixa.
INSERT INTO public.inventory_lots(inventory_id,code,quantity,amount,unit_cost,received,source_key,as_of,receipt_status,notes)
SELECT i.id,v.code,v.qty,v.amount,v.unit,v.received,'controle-nfc:'||v.code,'2026-09-20','historical_review','Histórico recuperado; datas de compra, pagamento e saldo atual a confirmar. NFC-03 aproximado e a caminho naquela data.' FROM (VALUES('ACR-01','Base/acrílico — referência atual',12,3600,300::numeric,12),('ACR-02','Base/acrílico — referência atual',200,64000,320::numeric,200),('NFC-01','Etiqueta NFC — referência provisória',150,10800,72::numeric,150),('NFC-02','Etiqueta NFC — referência provisória',150,10800,72::numeric,150),('NFC-03','Etiqueta NFC — referência provisória',400,11500,28.75::numeric,0),('IMP-01','Adesivo impresso — referência atual',60,5000,83.333333::numeric,60)) v(code,material,qty,amount,unit,received) JOIN inventory_items i ON i.name=v.material ON CONFLICT(source_key) DO NOTHING;
INSERT INTO settings(key,value) VALUES('v2_ready','true'::jsonb) ON CONFLICT(key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.axl_ops(p_action text,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
<<ops>>
DECLARE rid uuid:=gen_random_uuid();cid uuid;sid uuid;oid uuid;pid uuid;prod record;sale record;ord record;material record;lot record;line jsonb;snapshot jsonb;all_snap jsonb:='[]';x record;needed numeric;reserved numeric;unit_cost numeric;item_cost integer;total_cost integer:=0;plates integer:=0;amount integer;paid integer;qty integer;discount integer;cost_state text:='confirmed';item_state text;origin text;allocated boolean;count_matches integer;v_status text;flow boolean:=false;done_stock boolean:=true;
BEGIN
IF NOT public.is_axl_member() THEN RAISE EXCEPTION 'Acesso não autorizado.';END IF;
IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR octet_length(d::text)>200000 THEN RAISE EXCEPTION 'Dados inválidos.';END IF;
PERFORM pg_advisory_xact_lock(184771);
CASE p_action
WHEN 'quick_sale' THEN
IF NULLIF(d->>'request_id','') IS NULL THEN RAISE EXCEPTION 'Identificador da venda obrigatório.';END IF;
SELECT id INTO sid FROM sales WHERE request_id=(d->>'request_id')::uuid;
IF sid IS NOT NULL THEN RETURN jsonb_build_object('id',sid,'company_id',(SELECT company_id FROM sales WHERE id=sid),'duplicate',true);END IF;
amount:=(d->>'total')::integer;discount:=COALESCE((d->>'discount')::integer,0);
IF amount IS NULL OR amount<=0 OR discount<0 OR jsonb_array_length(d->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Confira quantidade e valor total.';END IF;
cid:=NULLIF(d->>'company_id','')::uuid;
IF cid IS NOT NULL THEN IF NOT EXISTS(SELECT 1 FROM companies WHERE id=cid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Estabelecimento não encontrado.';END IF;
ELSE
IF length(btrim(COALESCE(d->>'name',''))) NOT BETWEEN 2 AND 160 THEN RAISE EXCEPTION 'Informe o estabelecimento.';END IF;
IF NULLIF(d->>'place_id','') IS NOT NULL THEN SELECT id INTO cid FROM companies WHERE place_id=d->>'place_id' AND deleted_at IS NULL;END IF;
IF cid IS NULL THEN
SELECT count(*) INTO count_matches FROM companies WHERE lower(btrim(name))=lower(btrim(d->>'name')) AND deleted_at IS NULL;
IF count_matches>0 AND NOT COALESCE((d->>'new_homonym')::boolean,false) THEN RAISE EXCEPTION 'Já existe nome semelhante. Selecione a ficha correta ou confirme novo estabelecimento homônimo.';END IF;
INSERT INTO companies(name,city,contact,phone,status,is_customer,is_lead,origin,place_id) VALUES(btrim(d->>'name'),COALESCE(d->>'city',''),COALESCE(d->>'contact',''),COALESCE(d->>'phone',''),'Venda',true,false,'Venda rápida',NULLIF(d->>'place_id','')) RETURNING id INTO cid;
END IF;END IF;
allocated:=NOT EXISTS(SELECT 1 FROM jsonb_array_elements(d->'items') j WHERE j->>'line_total' IS NULL);
IF allocated AND (SELECT sum((j->>'line_total')::integer) FROM jsonb_array_elements(d->'items') j)<>amount THEN RAISE EXCEPTION 'Valores dos itens não conciliam com o total.';END IF;
v_status:=COALESCE(d->>'payment_status','unknown');paid:=COALESCE((d->>'paid')::integer,0);
IF v_status='received' THEN paid:=amount;ELSIF v_status IN('unknown','pending') THEN IF paid>0 THEN RAISE EXCEPTION 'Informe pagamento parcial ou recebido para registrar entrada.';END IF;paid:=0;ELSIF v_status='partial' AND (d->>'paid' IS NULL OR paid<=0 OR paid>=amount) THEN RAISE EXCEPTION 'Recebimento parcial deve ser maior que zero e menor que a venda.';END IF;
IF v_status NOT IN('unknown','pending','partial','received') THEN RAISE EXCEPTION 'Situação de pagamento inválida.';END IF;
INSERT INTO sales(company_id,date,total,cost,profit,margin,plates,method,due_date,notes,commission,commission_rule,payment_known,user_id,request_id,revenue_allocated,discount,seller_lat,seller_lng) VALUES(cid,(d->>'date')::date,amount,0,0,0,0,COALESCE(d->>'method','Não informado'),NULLIF(d->>'due_date','')::date,COALESCE(d->>'notes',''),0,'{}',v_status<>'unknown',auth.uid(),(d->>'request_id')::uuid,allocated,discount,NULLIF(d->>'seller_lat','')::numeric,NULLIF(d->>'seller_lng','')::numeric) RETURNING id INTO sid;
FOR line IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
SELECT * INTO prod FROM products WHERE id=(line->>'product_id')::uuid AND active AND deleted_at IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'Produto não disponível.';END IF;
qty:=(line->>'quantity')::integer;IF qty IS NULL OR qty NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Quantidade inválida.';END IF;
snapshot:='[]';unit_cost:=0;item_state:='confirmed';origin:='Composição atual';
IF prod.kind='service' THEN IF (line->>'service_cost')::integer<0 THEN RAISE EXCEPTION 'Custo de serviço inválido.';END IF;IF line->>'service_cost' IS NULL THEN item_state:='unknown';origin:='Custo de serviço não informado';ELSE unit_cost:=(line->>'service_cost')::integer;origin:='Custo de serviço informado';END IF;
ELSE
flow:=true;
IF COALESCE((line->>'from_stock')::boolean,false) THEN
IF prod.stock_inventory_id IS NULL THEN RAISE EXCEPTION 'Vincule estoque de placa pronta ao produto antes de selecionar esta opção.';END IF;
SELECT * INTO material FROM inventory_items WHERE id=prod.stock_inventory_id FOR UPDATE;
IF NOT material.quantity_known OR material.quantity<qty THEN RAISE EXCEPTION 'Estoque de placas prontas não confirmado ou insuficiente.';END IF;
snapshot:=jsonb_build_array(jsonb_build_object('inventory_id',material.id,'quantity',1,'cost',material.cost,'origin','Produto pronto; não baixar componentes novamente'));
unit_cost:=material.cost;item_state:=material.cost_status;
ELSE
done_stock:=false;
FOR x IN SELECT c.inventory_id,c.quantity,i.cost,i.cost_status,i.cost_origin FROM product_components c JOIN inventory_items i ON i.id=c.inventory_id WHERE c.product_id=prod.id LOOP
unit_cost:=unit_cost+x.quantity*x.cost;
IF x.cost_status='unknown' THEN item_state:='unknown';ELSIF x.cost_status='estimated' AND item_state<>'unknown' THEN item_state:='estimated';END IF;
snapshot:=snapshot||jsonb_build_array(jsonb_build_object('inventory_id',x.inventory_id,'quantity',x.quantity,'cost',x.cost,'cost_status',x.cost_status,'origin',x.cost_origin));
END LOOP;
IF snapshot='[]' AND prod.controls_stock THEN item_state:='unknown';origin:='Composição pendente';END IF;
IF NULLIF(line->>'lot_id','') IS NOT NULL THEN
SELECT * INTO lot FROM inventory_lots WHERE id=(line->>'lot_id')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado.';END IF;
IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) c WHERE c->>'inventory_id'=lot.inventory_id::text) THEN RAISE EXCEPTION 'Lote não pertence à composição do produto.';END IF;
SELECT sum((c->>'quantity')::numeric*CASE WHEN c->>'inventory_id'=lot.inventory_id::text THEN lot.unit_cost ELSE (c->>'cost')::numeric END)::numeric INTO needed FROM jsonb_array_elements(snapshot) c;
unit_cost:=needed;
SELECT jsonb_agg(CASE WHEN c->>'inventory_id'=lot.inventory_id::text THEN c||jsonb_build_object('cost',lot.unit_cost,'cost_status',CASE WHEN lot.receipt_status='historical_review' OR lot.code='NFC-03' THEN 'estimated' ELSE 'confirmed' END,'origin','Lote '||lot.code) ELSE c END) INTO snapshot FROM jsonb_array_elements(snapshot) c;
origin:='Lote selecionado '||lot.code||CASE WHEN lot.receipt_status='historical_review' THEN ' — referência histórica para revisão' ELSE '' END;
SELECT CASE WHEN bool_or(c->>'cost_status'='unknown') THEN 'unknown' WHEN bool_or(c->>'cost_status'='estimated') THEN 'estimated' ELSE 'confirmed' END INTO item_state FROM jsonb_array_elements(snapshot) c;
END IF;END IF;END IF;
IF item_state='unknown' THEN cost_state:='unknown';ELSIF item_state='estimated' AND cost_state<>'unknown' THEN cost_state:='estimated';END IF;
item_cost:=round(unit_cost*qty)::integer;total_cost:=total_cost+item_cost;IF prod.is_plate THEN plates:=plates+qty;END IF;
INSERT INTO sale_items(sale_id,product_id,product_name,quantity,price,cost,is_plate,margin,components_snapshot,cost_status,cost_origin,line_total,revenue_known,unit_cost_precise,cost_total) VALUES(sid,prod.id,prod.name,qty,CASE WHEN allocated THEN ((line->>'line_total')::integer/qty) ELSE 0 END,unit_cost,prod.is_plate,0,snapshot,item_state,origin,NULLIF(line->>'line_total','')::integer,allocated,unit_cost,item_cost);
all_snap:=all_snap||jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',qty,'components',snapshot));
END LOOP;
UPDATE sales SET cost=total_cost,profit=amount-total_cost,margin=100.0*(amount-total_cost)/amount,plates=ops.plates,cost_status=cost_state,cost_known=cost_state<>'unknown' WHERE id=sid;
IF flow THEN INSERT INTO orders(sale_id,company_id,status,notes,item_snapshot) VALUES(sid,cid,'Pedido recebido',COALESCE(d->>'notes',''),all_snap) RETURNING id INTO oid;
INSERT INTO order_events(order_id,user_id,type,notes) VALUES(oid,auth.uid(),'Pedido recebido','Criado pela venda rápida');IF done_stock AND NOT COALESCE((d->>'defer_production')::boolean,false) THEN UPDATE orders SET status='Arte aprovada' WHERE id=oid;PERFORM public.axl_ops('produce',jsonb_build_object('id',oid));END IF;END IF;
IF paid>amount THEN RAISE EXCEPTION 'Recebimento excede total.';END IF;IF paid>0 THEN INSERT INTO payments(sale_id,amount,method,date) VALUES(sid,paid,COALESCE(d->>'method','Não informado'),(d->>'date')::date);END IF;
UPDATE companies SET is_customer=true,status='Venda' WHERE id=cid;
PERFORM axl_activity(cid,'Venda','Venda rápida registrada; pagamento: '||v_status);
RETURN jsonb_build_object('id',sid,'company_id',cid,'order_id',oid,'total',amount,'cost_status',cost_state);
WHEN 'contact' THEN
cid:=(d->>'company_id')::uuid;v_status:=d->>'type';
IF v_status NOT IN('WhatsApp aberto','Mensagem enviada','Resposta','Ligação','Visita','Proposta','Observação') THEN RAISE EXCEPTION 'Tipo de contato inválido.';END IF;
INSERT INTO contact_events(company_id,user_id,type,phone,text,result,next_at) VALUES(cid,auth.uid(),v_status,d->>'phone',d->>'text',d->>'result',d->>'next_at') RETURNING id INTO rid;
PERFORM axl_activity(cid,v_status,concat_ws(E'\n','Número: '||COALESCE(d->>'phone',''),COALESCE(d->>'text',''),'Resultado: '||COALESCE(d->>'result','Não informado')));
IF v_status IN('Mensagem enviada','Ligação','Visita') THEN UPDATE companies SET status='Contato realizado' WHERE id=cid AND companies.status='Novo lead';END IF;
IF NULLIF(d->>'next_at','') IS NOT NULL THEN INSERT INTO followups(company_id,scheduled_at,date,reason,responsible) VALUES(cid,(d->>'next_at')::timestamp AT TIME ZONE 'America/Sao_Paulo',d->>'next_at','Retorno combinado',COALESCE((SELECT name FROM profiles WHERE id=auth.uid()),'Equipe AXL'));END IF;
WHEN 'stage_confirm' THEN
cid:=(d->>'company_id')::uuid;v_status:=d->>'status';IF v_status NOT IN('Novo lead','Contato realizado','Interessado','Proposta enviada','Negociação','Venda','Perdido') THEN RAISE EXCEPTION 'Etapa inválida.';END IF;
IF v_status='Contato realizado' AND NOT EXISTS(SELECT 1 FROM contact_events WHERE company_id=cid AND type IN('Mensagem enviada','Ligação','Visita')) THEN RAISE EXCEPTION 'Confirme um contato efetivo antes de alterar para Contato realizado.';END IF;
IF v_status='Perdido' AND length(btrim(COALESCE(d->>'reason','')))<3 THEN RAISE EXCEPTION 'Informe motivo da perda.';END IF;
UPDATE companies SET status=v_status WHERE id=cid;PERFORM axl_activity(cid,'Etapa comercial',v_status||' '||COALESCE(d->>'reason',''));rid:=cid;
WHEN 'proposal' THEN cid:=(d->>'company_id')::uuid;INSERT INTO proposals(company_id,user_id,text,amount) VALUES(cid,auth.uid(),d->>'text',NULLIF(d->>'amount','')::integer) RETURNING id INTO rid;PERFORM axl_activity(cid,'Proposta em rascunho',d->>'text');
WHEN 'lot_purchase' THEN
qty:=(d->>'quantity')::integer;amount:=(d->>'amount')::integer;needed:=COALESCE((d->>'received')::numeric,0);paid:=COALESCE((d->>'paid')::integer,0);
IF qty<=0 OR amount<0 OR needed<0 OR needed>qty OR paid<0 OR paid>amount+COALESCE((d->>'freight')::integer,0) THEN RAISE EXCEPTION 'Confira quantidade, recebimento e pagamento.';END IF;
IF paid>0 AND NULLIF(d->>'date','') IS NULL THEN RAISE EXCEPTION 'Confirme uma data para a saída financeira.';END IF;
INSERT INTO inventory_lots(inventory_id,code,quantity,amount,freight,unit_cost,received,purchase_date,supplier,paid,paid_known,financial_date,receipt_status,notes,user_id) VALUES((d->>'inventory_id')::uuid,d->>'code',qty,amount,COALESCE((d->>'freight')::integer,0),(amount+COALESCE((d->>'freight')::integer,0))::numeric/qty,needed,NULLIF(d->>'date','')::date,d->>'supplier',paid,d->>'paid' IS NOT NULL,CASE WHEN paid>0 THEN (d->>'date')::date END,'confirmed',d->>'notes',auth.uid()) RETURNING id INTO rid;
IF paid>0 THEN INSERT INTO lot_payments(lot_id,amount,date,user_id) VALUES(rid,paid,(d->>'date')::date,auth.uid());END IF;
IF needed>0 THEN SELECT * INTO material FROM inventory_items WHERE id=(d->>'inventory_id')::uuid FOR UPDATE;IF NOT material.quantity_known THEN RAISE EXCEPTION 'Confirme saldo físico inicial antes de acrescentar recebimento. A compra pode ser salva com recebido zero.';END IF;UPDATE inventory_items SET quantity=quantity+needed,cost=round((material.quantity*material.cost+needed*(amount+COALESCE((d->>'freight')::integer,0))::numeric/qty)/(material.quantity+needed)),cost_status='confirmed',cost_origin='Compra confirmada: '||(d->>'code') WHERE id=material.id;INSERT INTO inventory_movements(inventory_id,user_id,quantity,type,description) VALUES(material.id,auth.uid(),needed,'Entrada','Recebimento do lote '||(d->>'code'));END IF;
WHEN 'lot_review' THEN SELECT * INTO lot FROM inventory_lots WHERE id=(d->>'id')::uuid FOR UPDATE;needed:=(d->>'current_received')::numeric;IF NOT FOUND OR needed<0 OR needed>lot.quantity OR length(btrim(COALESCE(d->>'notes','')))<3 THEN RAISE EXCEPTION 'Confira recebimento atual e motivo.';END IF;UPDATE inventory_lots SET received=needed,receipt_status='reviewed_reference',as_of=(d->>'date')::date,notes=concat_ws(E'\n',notes,'Conferência sem entrada automática: '||(d->>'notes')) WHERE id=lot.id;rid:=lot.id;
WHEN 'lot_receive' THEN
SELECT * INTO lot FROM inventory_lots WHERE id=(d->>'id')::uuid FOR UPDATE;needed:=(d->>'quantity')::numeric;
IF NOT FOUND OR needed<=0 OR lot.received+needed>lot.quantity THEN RAISE EXCEPTION 'Recebimento excede saldo do lote.';END IF;
IF lot.receipt_status='historical_review' THEN RAISE EXCEPTION 'Lote histórico: confira primeiro saldo inicial e situação atual; não reimporte recebimentos antigos.';END IF;
SELECT * INTO material FROM inventory_items WHERE id=lot.inventory_id FOR UPDATE;IF NOT material.quantity_known THEN RAISE EXCEPTION 'Confirme a contagem física inicial.';END IF;
UPDATE inventory_lots SET received=received+needed,receipt_date=(d->>'date')::date WHERE id=lot.id;
UPDATE inventory_items SET quantity=quantity+needed,cost=round((material.quantity*material.cost+needed*lot.unit_cost)/(material.quantity+needed)),cost_status=CASE WHEN lot.code='NFC-03' THEN 'estimated' ELSE 'confirmed' END,cost_origin='Lote '||lot.code WHERE id=material.id;
INSERT INTO inventory_movements(inventory_id,user_id,quantity,type,description) VALUES(material.id,auth.uid(),needed,'Entrada','Recebimento parcial: '||lot.code);rid:=lot.id;
WHEN 'stock_count' THEN
SELECT * INTO material FROM inventory_items WHERE id=(d->>'id')::uuid FOR UPDATE;needed:=(d->>'quantity')::numeric;IF NOT FOUND OR needed<0 OR length(btrim(COALESCE(d->>'notes','')))<3 THEN RAISE EXCEPTION 'Informe a contagem e a observação.';END IF;
INSERT INTO inventory_counts(inventory_id,previous_quantity,quantity,date,initial,notes,user_id) VALUES(material.id,CASE WHEN material.quantity_known THEN material.quantity END,needed,(d->>'date')::date,NOT material.quantity_known OR COALESCE((d->>'initial')::boolean,false),d->>'notes',auth.uid());
INSERT INTO inventory_movements(inventory_id,user_id,quantity,type,description) VALUES(material.id,auth.uid(),needed-CASE WHEN material.quantity_known THEN material.quantity ELSE 0 END,'Contagem física',d->>'notes');
UPDATE inventory_items SET quantity=needed,quantity_known=true,stock_confirmed_at=(d->>'date')::date WHERE id=material.id;rid:=material.id;
WHEN 'material_cost' THEN UPDATE inventory_items SET cost=(d->>'cost')::integer,cost_status=d->>'status',cost_origin=d->>'origin' WHERE id=(d->>'id')::uuid;rid:=(d->>'id')::uuid;
WHEN 'cash_entry' THEN INSERT INTO cash_entries(type,amount,date,notes,user_id) VALUES(d->>'type',(d->>'amount')::integer,(d->>'date')::date,d->>'notes',auth.uid()) RETURNING id INTO rid;
WHEN 'lot_payment' THEN SELECT * INTO lot FROM inventory_lots WHERE id=(d->>'id')::uuid FOR UPDATE;paid:=(d->>'amount')::integer;IF NOT FOUND OR paid<=0 OR lot.paid+paid>lot.amount+lot.freight THEN RAISE EXCEPTION 'Pagamento de compra excede saldo.';END IF;UPDATE inventory_lots SET paid=lot.paid+ops.paid,paid_known=true,financial_date=(d->>'date')::date WHERE id=lot.id;
INSERT INTO lot_payments(lot_id,amount,date,user_id) VALUES(lot.id,paid,(d->>'date')::date,auth.uid());rid:=lot.id;
WHEN 'payment_set' THEN
SELECT * INTO sale FROM sales WHERE id=(d->>'id')::uuid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.';END IF;
SELECT COALESCE(sum(p.amount),0) INTO paid FROM payments p WHERE p.sale_id=sale.id;v_status:=d->>'status';
IF v_status='unknown' AND paid>0 THEN RAISE EXCEPTION 'Não apague recebimentos confirmados.';END IF;
UPDATE sales SET payment_known=v_status<>'unknown' WHERE id=sale.id;
amount:=CASE WHEN v_status='received' THEN sale.total-paid WHEN v_status='partial' THEN COALESCE((d->>'amount')::integer,0) ELSE 0 END;
IF amount>0 THEN IF NULLIF(d->>'date','') IS NULL OR paid+amount>sale.total THEN RAISE EXCEPTION 'Informe a data e um valor dentro do saldo.';END IF;INSERT INTO payments(sale_id,amount,method,date) VALUES(sale.id,amount,COALESCE(d->>'method','Não informado'),(d->>'date')::date);ELSIF v_status='partial' THEN RAISE EXCEPTION 'Informe o valor recebido.';END IF;rid:=sale.id;
WHEN 'product_stock' THEN
UPDATE products SET stock_inventory_id=NULLIF(d->>'inventory_id','')::uuid WHERE id=(d->>'id')::uuid;rid:=(d->>'id')::uuid;
WHEN 'order_items' THEN
SELECT * INTO ord FROM orders WHERE id=(d->>'id')::uuid FOR UPDATE;IF NOT FOUND OR ord.produced_at IS NOT NULL OR ord.status='Cancelado' THEN RAISE EXCEPTION 'Só edite itens antes de produzir; consumo real permanece preservado.';END IF;
IF jsonb_array_length(d->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Informe itens físicos.';END IF;
all_snap:='[]';FOR line IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
SELECT * INTO prod FROM products WHERE id=(line->>'product_id')::uuid AND active;IF NOT FOUND OR prod.kind='service' THEN RAISE EXCEPTION 'Pedido de produção exige solução física.';END IF;
qty:=(line->>'quantity')::integer;IF qty NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Quantidade inválida.';END IF;
IF COALESCE((line->>'from_stock')::boolean,false) THEN IF prod.stock_inventory_id IS NULL THEN RAISE EXCEPTION 'Vincule estoque de produto pronto.';END IF;snapshot:=jsonb_build_array(jsonb_build_object('inventory_id',prod.stock_inventory_id,'quantity',1));
ELSE SELECT COALESCE(jsonb_agg(jsonb_build_object('inventory_id',c.inventory_id,'quantity',c.quantity)),'[]') INTO snapshot FROM product_components c WHERE c.product_id=prod.id;END IF;
IF snapshot='[]' THEN RAISE EXCEPTION 'Informe composição do produto antes de criar pedido.';END IF;
all_snap:=all_snap||jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',qty,'components',snapshot));END LOOP;
UPDATE inventory_reservations SET status='released' WHERE order_id=ord.id AND inventory_reservations.status='reserved';UPDATE orders SET item_snapshot=all_snap WHERE id=ord.id;INSERT INTO order_events(order_id,user_id,type,notes) VALUES(ord.id,auth.uid(),'Itens revisados','Reservas liberadas; venda e custo histórico preservados. Reserve novamente.');rid:=ord.id;
WHEN 'direct_order' THEN
SELECT * INTO prod FROM products WHERE id=(d->>'product_id')::uuid AND active;IF NOT FOUND OR prod.kind='service' THEN RAISE EXCEPTION 'Escolha solução física.';END IF;
SELECT COALESCE(jsonb_agg(jsonb_build_object('inventory_id',inventory_id,'quantity',quantity)),'[]') INTO snapshot FROM product_components WHERE product_id=prod.id;
INSERT INTO orders(company_id,status,notes,promised_date,item_snapshot) VALUES((d->>'company_id')::uuid,'Pedido recebido',d->>'notes',NULLIF(d->>'promised_date','')::date,jsonb_build_array(jsonb_build_object('product_id',prod.id,'quantity',(d->>'quantity')::integer,'components',snapshot))) RETURNING id INTO rid;
INSERT INTO order_events(order_id,user_id,type,notes) VALUES(rid,auth.uid(),'Pedido recebido','Pedido direto, sem gerar venda artificial.');
WHEN 'order_update' THEN
SELECT * INTO ord FROM orders WHERE id=(d->>'id')::uuid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.';END IF;
v_status:=d->>'status';IF v_status IN('Produção','Pronto para entrega','Saiu para entrega','Entregue') AND ord.status NOT IN('Arte aprovada','Produção','Pronto para entrega','Saiu para entrega','Entregue') THEN RAISE EXCEPTION 'Registre aprovação antes de produzir ou entregar.';END IF;
IF v_status IN('Pronto para entrega','Saiu para entrega','Entregue') AND ord.produced_at IS NULL THEN RAISE EXCEPTION 'Confirme a produção antes da entrega.';END IF;
IF v_status='Cancelado' AND length(btrim(COALESCE(d->>'notes','')))<3 THEN RAISE EXCEPTION 'Informe motivo do cancelamento.';END IF;
IF v_status='Cancelado' THEN UPDATE inventory_reservations SET status='released' WHERE order_id=ord.id AND inventory_reservations.status='reserved';END IF;
UPDATE orders SET status=v_status,notes=COALESCE(d->>'notes',notes),promised_date=NULLIF(d->>'promised_date','')::date,responsible_id=NULLIF(d->>'responsible_id','')::uuid,cancelled_reason=CASE WHEN v_status='Cancelado' THEN d->>'notes' ELSE cancelled_reason END WHERE id=ord.id;
INSERT INTO order_events(order_id,user_id,type,notes) VALUES(ord.id,auth.uid(),v_status,concat_ws(' ',ord.status||' → '||v_status,d->>'notes'));rid:=ord.id;
WHEN 'reserve','produce' THEN
SELECT * INTO ord FROM orders WHERE id=(d->>'id')::uuid FOR UPDATE;IF NOT FOUND OR ord.status='Cancelado' THEN RAISE EXCEPTION 'Pedido não disponível.';END IF;
IF p_action='reserve' AND ord.produced_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido já consumido; não reserve novamente.';END IF;
IF p_action='produce' AND (ord.produced_at IS NOT NULL OR ord.status NOT IN('Arte aprovada','Produção')) THEN RAISE EXCEPTION 'Produção exige aprovação e só pode ser baixada uma vez.';END IF;
snapshot:=ord.item_snapshot;
IF snapshot='[]' THEN SELECT COALESCE(jsonb_agg(jsonb_build_object('quantity',quantity,'components',components_snapshot)),'[]') INTO snapshot FROM sale_items WHERE sale_id=ord.sale_id;END IF;
IF snapshot='[]' OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(snapshot) l CROSS JOIN LATERAL jsonb_array_elements(l->'components') c) THEN RAISE EXCEPTION 'Composição física a conferir.';END IF;
FOR x IN SELECT (c->>'inventory_id')::uuid inventory_id,sum((l->>'quantity')::numeric*(c->>'quantity')::numeric) quantity FROM jsonb_array_elements(snapshot) l CROSS JOIN LATERAL jsonb_array_elements(l->'components') c GROUP BY (c->>'inventory_id')::uuid LOOP
SELECT * INTO material FROM inventory_items WHERE id=x.inventory_id FOR UPDATE;
SELECT COALESCE(sum(r.quantity),0) INTO reserved FROM inventory_reservations r WHERE r.inventory_id=x.inventory_id AND r.status='reserved' AND r.order_id<>ord.id;
IF NOT material.quantity_known OR material.quantity-reserved<x.quantity THEN RAISE EXCEPTION 'Material a conferir ou saldo disponível insuficiente: %',material.name;END IF;
IF p_action='reserve' THEN INSERT INTO inventory_reservations(order_id,inventory_id,quantity) VALUES(ord.id,material.id,x.quantity) ON CONFLICT(order_id,inventory_id) WHERE inventory_reservations.status='reserved' DO UPDATE SET quantity=excluded.quantity;
ELSE UPDATE inventory_items SET quantity=quantity-x.quantity WHERE id=material.id;INSERT INTO inventory_movements(inventory_id,user_id,order_id,quantity,type,description) VALUES(material.id,auth.uid(),ord.id,-x.quantity,'Produção','Consumo real confirmado, uma vez');END IF;
END LOOP;
IF p_action='produce' THEN UPDATE orders SET status='Pronto para entrega',produced_at=now() WHERE id=ord.id;UPDATE inventory_reservations SET status='consumed' WHERE order_id=ord.id AND inventory_reservations.status='reserved';END IF;
INSERT INTO order_events(order_id,user_id,type,notes) VALUES(ord.id,auth.uid(),CASE WHEN p_action='produce' THEN 'Produção confirmada' ELSE 'Reserva de materiais' END,'Reserva não representa consumo.');rid:=ord.id;
ELSE RAISE EXCEPTION 'Ação não reconhecida.';
END CASE;
PERFORM axl_audit(p_action,rid,'operacao');RETURN jsonb_build_object('id',rid,'ok',true);
END $$;
REVOKE ALL ON FUNCTION public.axl_ops(text,jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.axl_ops(text,jsonb) TO authenticated;
-- Leitura v2 inclui dados operacionais sem duplicar vendas ou compras históricas.
CREATE OR REPLACE FUNCTION public.axl_state_v2() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
result:=public.axl_state();
RETURN result||jsonb_build_object('v2',true,
'lotPayments',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM lot_payments l),'[]'),
'lots',COALESCE((SELECT jsonb_agg(to_jsonb(l)) FROM inventory_lots l),'[]'),
'counts',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM inventory_counts c),'[]'),
'reservations',COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM inventory_reservations r),'[]'),
'cash',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM cash_entries c),'[]'),
'contacts',COALESCE((SELECT jsonb_agg(to_jsonb(c)||jsonb_build_object('user_name',p.name)) FROM contact_events c JOIN profiles p ON p.id=c.user_id),'[]'),
'orderEvents',COALESCE((SELECT jsonb_agg(to_jsonb(e)||jsonb_build_object('user_name',p.name)) FROM order_events e JOIN profiles p ON p.id=e.user_id),'[]'),
'proposals',COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM proposals p),'[]'),
'orders',COALESCE((SELECT jsonb_agg(to_jsonb(o)||jsonb_build_object('number',s.number,'company_name',c.name)) FROM orders o LEFT JOIN sales s ON s.id=o.sale_id JOIN companies c ON c.id=COALESCE(o.company_id,s.company_id)),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.axl_state_v2() FROM PUBLIC;GRANT EXECUTE ON FUNCTION public.axl_state_v2() TO authenticated;
-- Compatibilidade: operações antigas sensíveis passam pela validação v2.
DO $$ DECLARE definition text;BEGIN
definition:=pg_get_functiondef('public.axl_mutate(text,jsonb)'::regprocedure);
IF position('Use a operação v2' in definition)=0 THEN definition:=replace(definition,'IF NOT public.is_axl_member() THEN','IF p_action IN(''stage'',''order'',''produce'',''purchase'',''stock'',''sale'') THEN RAISE EXCEPTION ''Use a operação v2 para preservar contatos, pagamentos e estoque.''; END IF; IF NOT public.is_axl_member() THEN');EXECUTE definition;END IF;
END $$;
CREATE OR REPLACE FUNCTION public.axl_contact_stage_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
IF NEW.status='Contato realizado' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) AND NOT EXISTS(SELECT 1 FROM contact_events WHERE company_id=NEW.id AND type IN('Mensagem enviada','Ligação','Visita')) THEN RAISE EXCEPTION 'Confirme um contato efetivo antes de mudar a etapa.';END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS axl_contact_stage_guard ON public.companies;
CREATE TRIGGER axl_contact_stage_guard BEFORE INSERT OR UPDATE OF status ON public.companies FOR EACH ROW EXECUTE FUNCTION public.axl_contact_stage_guard();
COMMIT;
