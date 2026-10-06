-- Aplicar DEPOIS de supabase.sql. Integração HTTP/RPC sem credencial PostgreSQL no servidor.
BEGIN;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_lead boolean NOT NULL DEFAULT true;
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS supplier text NOT NULL DEFAULT '';
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS date text;
ALTER TABLE public.followups ADD COLUMN IF NOT EXISTS responsible text NOT NULL DEFAULT '';
UPDATE public.followups SET date=to_char(scheduled_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI') WHERE date IS NULL;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS margin numeric NOT NULL DEFAULT 0;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;
UPDATE public.expenses SET paid=true WHERE paid_at IS NOT NULL;
CREATE OR REPLACE FUNCTION public.axl_audit(p_action text,p_id uuid,p_entity text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
IF NOT public.is_axl_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador.'; END IF;
INSERT INTO public.audit_logs(user_id,action,entity_id,entity_type) VALUES(auth.uid(),p_action,p_id,p_entity);END $$;
CREATE OR REPLACE FUNCTION public.axl_activity(p_company uuid,p_type text,p_description text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$ BEGIN
IF NOT public.is_axl_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador.'; END IF;
INSERT INTO public.activities(company_id,user_id,type,description) VALUES(p_company,auth.uid(),p_type,p_description);END $$;
CREATE OR REPLACE FUNCTION public.axl_mutate(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE d jsonb:=p_data; rid uuid; company uuid; line jsonb; snap jsonb; comps jsonb; items jsonb:='[]'; material record; item public.products%ROWTYPE; sale public.sales%ROWTYPE; ord public.orders%ROWTYPE; stock public.inventory_items%ROWTYPE; seller public.salespeople%ROWTYPE; total bigint:=0; costs bigint:=0; plates integer:=0; qty numeric; price bigint; itemcost integer; paid bigint; rule jsonb; com integer:=0; n bigint; stage text; amount integer; position integer:=0;
BEGIN
IF NOT public.is_axl_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador.'; END IF;
IF d IS NULL OR jsonb_typeof(d)<>'object' OR octet_length(d::text)>200000 THEN RAISE EXCEPTION 'Dados inválidos.'; END IF;
-- Serializa operações comerciais deste MVP e mantém cada ação/auditoria na mesma transação.
PERFORM pg_advisory_xact_lock(184771);
rid:=COALESCE(NULLIF(d->>'id','')::uuid,gen_random_uuid());
CASE p_action
WHEN 'company' THEN
IF length(trim(d->>'name'))<2 OR length(trim(d->>'city'))<2 THEN RAISE EXCEPTION 'Informe nome e cidade.'; END IF;
INSERT INTO public.companies(id,name,legal_name,document,contact,phone,email,city,neighborhood,state,address,postal_code,segment,origin,notes,is_customer,is_lead,status,salesperson_id,place_id)
VALUES(rid,d->>'name',COALESCE(d->>'legal_name',''),COALESCE(d->>'document',''),COALESCE(d->>'contact',''),COALESCE(d->>'phone',''),COALESCE(d->>'email',''),d->>'city',COALESCE(d->>'neighborhood',''),COALESCE(d->>'state','SP'),COALESCE(d->>'address',''),COALESCE(d->>'postal_code',''),COALESCE(d->>'segment','Outros'),COALESCE(d->>'origin','Outro'),COALESCE(d->>'notes',''),COALESCE((d->>'is_customer')::boolean,false),COALESCE((d->>'is_lead')::boolean,true),COALESCE(d->>'status','Novo lead'),NULLIF(d->>'salesperson_id','')::uuid,NULLIF(d->>'place_id',''))
ON CONFLICT(id) DO UPDATE SET name=excluded.name,legal_name=excluded.legal_name,document=excluded.document,contact=excluded.contact,phone=excluded.phone,email=excluded.email,city=excluded.city,neighborhood=excluded.neighborhood,state=excluded.state,address=excluded.address,postal_code=excluded.postal_code,segment=excluded.segment,origin=excluded.origin,notes=excluded.notes,is_customer=excluded.is_customer,is_lead=excluded.is_lead,status=excluded.status,salesperson_id=excluded.salesperson_id,place_id=excluded.place_id;
PERFORM axl_activity(rid,'Cadastro/alteração','Cadastro salvo; histórico preservado.');
WHEN 'product' THEN
IF length(trim(d->>'name'))<2 OR length(trim(d->>'sku'))<1 THEN RAISE EXCEPTION 'Informe nome e SKU.'; END IF;
INSERT INTO public.products(id,name,sku,category,description,price,cost,is_plate,active,uses_nfc,uses_acrylic,controls_stock,unit) VALUES(rid,d->>'name',d->>'sku',d->>'category',COALESCE(d->>'description',''),(d->>'price')::integer,(d->>'cost')::integer,COALESCE((d->>'is_plate')::boolean,true),COALESCE((d->>'active')::boolean,true),COALESCE((d->>'uses_nfc')::boolean,false),COALESCE((d->>'uses_acrylic')::boolean,false),COALESCE((d->>'controls_stock')::boolean,false),COALESCE(d->>'unit','un')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,sku=excluded.sku,category=excluded.category,description=excluded.description,price=excluded.price,cost=excluded.cost,is_plate=excluded.is_plate,active=excluded.active,uses_nfc=excluded.uses_nfc,uses_acrylic=excluded.uses_acrylic,controls_stock=excluded.controls_stock,unit=excluded.unit;
WHEN 'inventory' THEN
INSERT INTO public.inventory_items(id,name,unit,minimum,cost,supplier) VALUES(rid,d->>'name',d->>'unit',(d->>'minimum')::numeric,(d->>'cost')::integer,COALESCE(d->>'supplier','')) ON CONFLICT(id) DO UPDATE SET name=excluded.name,unit=excluded.unit,minimum=excluded.minimum,cost=excluded.cost,supplier=excluded.supplier;
WHEN 'sale' THEN
company:=(d->>'company_id')::uuid;
IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=company AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
IF jsonb_typeof(d->'items')<>'array' OR jsonb_array_length(d->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Informe os itens da venda.'; END IF;
FOR line IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
SELECT * INTO item FROM public.products WHERE id=(line->>'product_id')::uuid AND active AND deleted_at IS NULL FOR SHARE;
IF NOT FOUND THEN RAISE EXCEPTION 'Produto indisponível.'; END IF;
qty:=(line->>'quantity')::numeric;price:=(line->>'price')::bigint;
IF qty IS NULL OR price IS NULL OR qty<>trunc(qty) OR qty NOT BETWEEN 1 AND 10000 OR price NOT BETWEEN 0 AND 100000000 THEN RAISE EXCEPTION 'Quantidade ou preço inválido.'; END IF;
PERFORM i.id FROM public.inventory_items i JOIN public.product_components c ON c.inventory_id=i.id WHERE c.product_id=item.id ORDER BY i.id FOR SHARE OF i;
SELECT COALESCE(jsonb_agg(jsonb_build_object('inventory_id',c.inventory_id,'quantity',c.quantity,'cost',i.cost)),'[]'::jsonb),COALESCE(round(sum(c.quantity*i.cost))::integer,item.cost) INTO comps,itemcost FROM public.product_components c JOIN public.inventory_items i ON i.id=c.inventory_id WHERE c.product_id=item.id;
total:=total+price*qty;costs:=costs+itemcost*qty;IF item.is_plate THEN plates:=plates+qty;END IF;
items:=items||jsonb_build_array(jsonb_build_object('product_id',item.id,'product_name',item.name,'quantity',qty,'price',price,'cost',itemcost,'is_plate',item.is_plate,'components_snapshot',CASE WHEN item.controls_stock THEN comps ELSE '[]'::jsonb END));
END LOOP;
paid:=COALESCE((d->>'paid')::bigint,0);
IF total NOT BETWEEN 1 AND 1000000000 OR paid NOT BETWEEN 0 AND total THEN RAISE EXCEPTION 'Total ou pagamento inválido.'; END IF;
IF NULLIF(d->>'salesperson_id','') IS NOT NULL THEN SELECT * INTO seller FROM public.salespeople WHERE id=(d->>'salesperson_id')::uuid AND active;IF NOT FOUND THEN RAISE EXCEPTION 'Vendedor inválido.';END IF;END IF;
rule:=jsonb_build_object('type',COALESCE(seller.commission_type,'percent'),'value',COALESCE(seller.commission_value,0));
com:=round(CASE COALESCE(seller.commission_type,'percent') WHEN 'percent' THEN total*COALESCE(seller.commission_value,0)/100 WHEN 'margin' THEN (total-costs)*COALESCE(seller.commission_value,0)/100 WHEN 'plate' THEN plates*COALESCE(seller.commission_value,0) ELSE 0 END);
INSERT INTO public.sales(company_id,salesperson_id,date,total,cost,profit,plates,margin,commission,commission_rule,method,due_date,notes) VALUES(company,NULLIF(d->>'salesperson_id','')::uuid,(d->>'date')::date,total,costs,total-costs,plates,100.0*(total-costs)/total,com,rule,d->>'method',(d->>'due_date')::date,COALESCE(d->>'notes','')) RETURNING id,number INTO rid,n;
FOR snap IN SELECT value FROM jsonb_array_elements(items) LOOP INSERT INTO public.sale_items(sale_id,product_id,product_name,quantity,price,cost,is_plate,margin,components_snapshot) VALUES(rid,(snap->>'product_id')::uuid,snap->>'product_name',(snap->>'quantity')::integer,(snap->>'price')::integer,(snap->>'cost')::integer,(snap->>'is_plate')::boolean,CASE WHEN (snap->>'price')::numeric>0 THEN 100.0*((snap->>'price')::numeric-(snap->>'cost')::numeric)/(snap->>'price')::numeric ELSE 0 END,snap->'components_snapshot');END LOOP;
IF paid>0 THEN INSERT INTO public.payments(sale_id,amount,method,date) VALUES(rid,paid,d->>'method',(d->>'date')::date);END IF;
INSERT INTO public.orders(sale_id) VALUES(rid);
UPDATE public.companies SET is_customer=true,status='Venda' WHERE id=company;
PERFORM axl_activity(company,'Venda','Venda #'||n||' registrada com custo e composição preservados.');
WHEN 'payment' THEN
SELECT * INTO sale FROM public.sales WHERE id=(d->>'sale_id')::uuid AND cancelled_at IS NULL FOR UPDATE;
IF NOT FOUND THEN RAISE EXCEPTION 'Venda não encontrada.';END IF;
SELECT COALESCE(sum(p.amount),0) INTO paid FROM public.payments p WHERE p.sale_id=sale.id;
amount:=(d->>'amount')::integer;IF amount IS NULL OR amount<=0 OR amount>sale.total-paid THEN RAISE EXCEPTION 'Valor supera o saldo a receber ou é inválido.';END IF;
INSERT INTO public.payments(sale_id,amount,method,date) VALUES(sale.id,amount,d->>'method',(d->>'date')::date) RETURNING id INTO rid;
PERFORM axl_activity(sale.company_id,'Pagamento','Pagamento registrado.');
WHEN 'produce' THEN
SELECT * INTO ord FROM public.orders WHERE id=rid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.';END IF;
IF ord.produced_at IS NOT NULL THEN RAISE EXCEPTION 'Pedido já produzido. Nenhum material foi baixado novamente.';END IF;
IF ord.status NOT IN ('Arte aprovada','Produção') THEN RAISE EXCEPTION 'Aprove a arte ou avance para Produção.';END IF;
FOR material IN SELECT (c->>'inventory_id')::uuid inventory_id,sum((c->>'quantity')::numeric*s.quantity) needed FROM public.sale_items s CROSS JOIN LATERAL jsonb_array_elements(s.components_snapshot) c WHERE s.sale_id=ord.sale_id GROUP BY (c->>'inventory_id')::uuid ORDER BY inventory_id LOOP
SELECT * INTO stock FROM public.inventory_items WHERE id=material.inventory_id FOR UPDATE;
IF NOT FOUND OR stock.quantity<material.needed THEN RAISE EXCEPTION 'Estoque insuficiente: %.',COALESCE(stock.name,'material');END IF;
UPDATE public.inventory_items SET quantity=quantity-material.needed WHERE id=stock.id;
INSERT INTO public.inventory_movements(inventory_id,user_id,order_id,quantity,type,description) VALUES(stock.id,auth.uid(),rid,-material.needed,'Produção','Baixa pela composição preservada na venda');
END LOOP;
UPDATE public.orders SET produced_at=now(),status='Pronto para entrega' WHERE id=rid;
SELECT company_id INTO company FROM public.sales WHERE id=ord.sale_id;PERFORM axl_activity(company,'Produção','Pedido produzido e materiais baixados.');
WHEN 'order' THEN
SELECT * INTO ord FROM public.orders WHERE id=rid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.';END IF;
stage:=d->>'status';IF stage NOT IN ('Pedido recebido','Arte pendente','Aguardando aprovação','Arte aprovada','Produção','Pronto para entrega','Saiu para entrega','Entregue','Cancelado') THEN RAISE EXCEPTION 'Status inválido.';END IF;
IF stage IN ('Pronto para entrega','Saiu para entrega','Entregue') AND ord.produced_at IS NULL THEN RAISE EXCEPTION 'Marque produzido antes desta etapa.';END IF;
UPDATE public.orders SET status=stage,promised_date=NULLIF(d->>'promised_date','')::date,notes=COALESCE(d->>'notes','') WHERE id=rid;
SELECT company_id INTO company FROM public.sales WHERE id=ord.sale_id;PERFORM axl_activity(company,'Pedido',stage);
WHEN 'stage' THEN
stage:=d->>'status';IF stage NOT IN ('Novo lead','Contato realizado','Interessado','Proposta enviada','Negociação','Venda','Perdido') THEN RAISE EXCEPTION 'Etapa inválida.';END IF;
IF stage='Perdido' AND length(trim(COALESCE(d->>'reason','')))=0 THEN RAISE EXCEPTION 'Informe o motivo de perda.';END IF;
UPDATE public.companies SET status=stage WHERE id=rid;IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.';END IF;PERFORM axl_activity(rid,'Status',stage||' '||COALESCE(d->>'reason',''));
WHEN 'activity' THEN
company:=(d->>'company_id')::uuid;PERFORM axl_activity(company,d->>'type',d->>'description');rid:=company;
WHEN 'followup' THEN
company:=(d->>'company_id')::uuid;
INSERT INTO public.followups(company_id,scheduled_at,date,responsible,reason) VALUES(company,(d->>'date')::timestamp AT TIME ZONE 'America/Sao_Paulo',d->>'date',COALESCE(d->>'responsible',''),d->>'reason') RETURNING id INTO rid;
PERFORM axl_activity(company,'Follow-up',d->>'reason');
WHEN 'followup_done' THEN
UPDATE public.followups SET done=true WHERE id=rid;IF NOT FOUND THEN RAISE EXCEPTION 'Retorno não encontrado.';END IF;
WHEN 'expense' THEN
INSERT INTO public.expenses(description,category,amount,date,paid,paid_at) VALUES(d->>'description',d->>'category',(d->>'amount')::integer,(d->>'date')::date,COALESCE((d->>'paid')::boolean,false),CASE WHEN (d->>'paid')::boolean THEN (d->>'date')::date::timestamp AT TIME ZONE 'America/Sao_Paulo' ELSE NULL END) RETURNING id INTO rid;
WHEN 'stock' THEN
SELECT * INTO stock FROM public.inventory_items WHERE id=rid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Material não encontrado.';END IF;
qty:=(d->>'quantity')::numeric;stage:=d->>'type';IF qty IS NULL OR qty=0 OR stock.quantity+qty<0 THEN RAISE EXCEPTION 'Quantidade inválida ou estoque negativo.';END IF;
IF stage NOT IN ('Entrada','Saída','Ajuste','Perda','Devolução') OR (stage IN ('Saída','Perda') AND qty>0) OR (stage IN ('Entrada','Devolução') AND qty<0) THEN RAISE EXCEPTION 'Tipo e quantidade incompatíveis.';END IF;
UPDATE public.inventory_items SET quantity=quantity+qty WHERE id=rid;INSERT INTO public.inventory_movements(inventory_id,user_id,quantity,type,description) VALUES(rid,auth.uid(),qty,stage,d->>'description');
WHEN 'purchase' THEN
SELECT * INTO stock FROM public.inventory_items WHERE id=(d->>'inventory_id')::uuid FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Material não encontrado.';END IF;
qty:=(d->>'quantity')::numeric;amount:=(d->>'total')::integer;IF qty IS NULL OR qty<=0 OR amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Quantidade ou total inválido.';END IF;
INSERT INTO public.purchases(date,total,notes) VALUES((d->>'date')::date,amount,'Fornecedor: '||(d->>'supplier')) RETURNING id INTO rid;
INSERT INTO public.purchase_items(purchase_id,inventory_id,quantity,total,unit_cost) VALUES(rid,stock.id,qty,amount,round(amount/qty));
UPDATE public.inventory_items SET quantity=quantity+qty,cost=round((stock.quantity*stock.cost+amount)/(stock.quantity+qty)),supplier=d->>'supplier',last_purchase_at=now() WHERE id=stock.id;
INSERT INTO public.inventory_movements(inventory_id,user_id,quantity,type,description) VALUES(stock.id,auth.uid(),qty,'Entrada','Compra — '||(d->>'supplier'));
INSERT INTO public.expenses(description,category,amount,date,paid,paid_at) VALUES('Compra — '||(d->>'supplier'),'Matéria-prima',amount,(d->>'date')::date,COALESCE((d->>'paid')::boolean,false),CASE WHEN (d->>'paid')::boolean THEN (d->>'date')::date::timestamp AT TIME ZONE 'America/Sao_Paulo' ELSE NULL END);
WHEN 'goal' THEN
UPDATE public.goals g SET amount=(d->>'amount')::integer WHERE g.id=rid;IF NOT FOUND THEN RAISE EXCEPTION 'Meta não encontrada.';END IF;
WHEN 'seller' THEN
stage:=d->>'commission_type';qty:=(d->>'commission_value')::numeric;IF stage NOT IN ('percent','margin','plate') OR qty<0 OR (stage<>'plate' AND qty>100) THEN RAISE EXCEPTION 'Regra de comissão inválida.';END IF;
INSERT INTO public.salespeople(name,email,city,commission_type,commission_value) VALUES(d->>'name',d->>'email',d->>'city',stage,qty) RETURNING id INTO rid;
WHEN 'route' THEN
IF jsonb_typeof(d->'companies')<>'array' OR jsonb_array_length(d->'companies') NOT BETWEEN 1 AND 25 THEN RAISE EXCEPTION 'Selecione de 1 a 25 empresas.';END IF;
INSERT INTO public.routes(name,date,salesperson_id) VALUES(d->>'name',(d->>'date')::date,NULLIF(d->>'salesperson_id','')::uuid) RETURNING id INTO rid;
FOR line IN SELECT value FROM jsonb_array_elements(d->'companies') LOOP company:=(line#>>'{}')::uuid;INSERT INTO public.route_stops(route_id,company_id,position) VALUES(rid,company,position) ON CONFLICT(route_id,company_id) DO NOTHING;position:=position+1;END LOOP;
WHEN 'stop' THEN
stage:=d->>'status';IF stage NOT IN ('Pendente','Visitado','Não encontrado','Interessado','Retornar depois','Venda realizada') THEN RAISE EXCEPTION 'Status de visita inválido.';END IF;
UPDATE public.route_stops SET status=stage,visited_at=now() WHERE id=rid RETURNING company_id INTO company;IF NOT FOUND THEN RAISE EXCEPTION 'Parada não encontrada.';END IF;PERFORM axl_activity(company,'Visita',stage);
WHEN 'components' THEN
rid:=(d->>'product_id')::uuid;IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=rid) THEN RAISE EXCEPTION 'Produto não encontrado.';END IF;
IF jsonb_typeof(d->'components')<>'array' OR jsonb_array_length(d->'components')>100 THEN RAISE EXCEPTION 'Composição inválida.';END IF;
IF EXISTS(SELECT 1 FROM jsonb_array_elements(d->'components') c GROUP BY c->>'inventory_id' HAVING count(*)>1) THEN RAISE EXCEPTION 'Não repita o mesmo material.';END IF;
DELETE FROM public.product_components WHERE product_id=rid;
FOR line IN SELECT value FROM jsonb_array_elements(d->'components') LOOP INSERT INTO public.product_components(product_id,inventory_id,quantity) VALUES(rid,(line->>'inventory_id')::uuid,(line->>'quantity')::numeric);END LOOP;
WHEN 'weights' THEN
FOR stage IN SELECT unnest(ARRAY['rating','reviews','phone','website','segment','contact','other']) LOOP IF d->>stage IS NULL OR (d->>stage)::integer NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'Pesos inválidos.';END IF;END LOOP;
INSERT INTO public.settings(key,value) VALUES('score_weights',d) ON CONFLICT(key) DO UPDATE SET value=excluded.value;rid:=NULL;
ELSE RAISE EXCEPTION 'Ação não reconhecida.';
END CASE;
PERFORM axl_audit(p_action,rid,p_action);
RETURN jsonb_build_object('id',rid,'ok',true);
END $$;
REVOKE ALL ON FUNCTION public.axl_audit(text,uuid,text),public.axl_activity(uuid,text,text),public.axl_mutate(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.axl_audit(text,uuid,text),public.axl_activity(uuid,text,text),public.axl_mutate(text,jsonb) TO authenticated;
COMMIT;
