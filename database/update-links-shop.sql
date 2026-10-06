-- Aplicar após update-2026-10-06.sql. Preserva dados; não publica produtos nem cobra clientes.
BEGIN;
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


ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK(role IN('ADMIN','VENDEDOR','PRODUCAO','FINANCEIRO','COMPRADOR'));
CREATE TABLE IF NOT EXISTS company_map_links(company_id uuid PRIMARY KEY REFERENCES companies(id),url text UNIQUE NOT NULL CHECK(length(url)<=4096),place_id text,source text NOT NULL,consulted_at timestamptz,user_id uuid REFERENCES profiles(id),updated_at timestamptz DEFAULT now());
ALTER TABLE company_map_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS team_read ON company_map_links;
CREATE POLICY team_read ON company_map_links FOR SELECT TO authenticated USING(is_axl_member());
GRANT SELECT ON company_map_links TO authenticated;
CREATE OR REPLACE FUNCTION axl_maps_save(d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid; existing uuid; f jsonb:=d->'fields'; pid text:=d->>'place_id'; link text:=d->>'url'; BEGIN
IF NOT is_axl_member() THEN RAISE EXCEPTION 'Acesso não autorizado.'; END IF;
PERFORM pg_advisory_xact_lock(184771);
IF link !~ '^https://(maps\.app\.goo\.gl/[A-Za-z0-9_-]+|goo\.gl/maps/[A-Za-z0-9_-]+|(www\.)?google\.com(\.br)?/maps([/?]|$)|maps\.google\.com/)' OR length(link)>4096 THEN RAISE EXCEPTION 'Link Google Maps inválido.'; END IF;
SELECT c.id INTO existing FROM companies c LEFT JOIN company_map_links m ON m.company_id=c.id WHERE (pid IS NOT NULL AND c.place_id=pid) OR m.url=link LIMIT 1;
IF existing IS NOT NULL THEN IF pid IS NOT NULL AND EXISTS(SELECT 1 FROM companies WHERE id=existing AND place_id IS NOT NULL AND place_id<>pid) THEN RAISE EXCEPTION 'Link associado a outro Place ID. Confira a ficha.';END IF;RETURN jsonb_build_object('id',existing,'existing',true); END IF;
rid:=NULLIF(d->>'company_id','')::uuid;
IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM companies WHERE id=rid AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Empresa inexistente.';END IF;
IF rid IS NULL THEN
 IF length(trim(f->>'name'))<2 THEN RAISE EXCEPTION 'Informe nome próprio do cadastro.';END IF;
 IF NOT COALESCE((d->>'new_homonym')::boolean,false) AND EXISTS(SELECT 1 FROM companies WHERE lower(name)=lower(f->>'name')) THEN RAISE EXCEPTION 'Possível homônimo. Selecione a ficha correta ou confirme empresa distinta.';END IF;
 rid:=gen_random_uuid();INSERT INTO companies(id,name,city,phone,address,segment,notes,origin,place_id,is_lead) VALUES(rid,f->>'name',COALESCE(f->>'city',''),COALESCE(f->>'phone',''),COALESCE(f->>'address',''),COALESCE(f->>'segment','Outros'),COALESCE(f->>'notes',''),'Google Maps · link',pid,true);
ELSE
 IF pid IS NOT NULL AND EXISTS(SELECT 1 FROM companies WHERE id=rid AND place_id IS NOT NULL AND place_id<>pid) THEN RAISE EXCEPTION 'Ficha associada a outra empresa Google.';END IF;
 UPDATE companies SET place_id=COALESCE(pid,place_id) WHERE id=rid;
END IF;
INSERT INTO company_map_links(company_id,url,place_id,source,consulted_at,user_id) VALUES(rid,link,pid,CASE WHEN pid IS NULL THEN 'Link informado' ELSE 'Google Maps' END,NULLIF(d->>'consulted_at','')::timestamptz,auth.uid()) ON CONFLICT(company_id) DO UPDATE SET url=excluded.url,place_id=excluded.place_id,consulted_at=excluded.consulted_at,user_id=excluded.user_id,updated_at=now();
PERFORM axl_activity(rid,'Google Maps','Link associado; campos próprios e histórico preservados.');PERFORM axl_audit('Empresa adicionada pelo link',rid,'companies');RETURN jsonb_build_object('id',rid,'existing',false);END $$;
REVOKE ALL ON FUNCTION axl_maps_save(jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION axl_maps_save(jsonb) TO authenticated;
CREATE TABLE IF NOT EXISTS shop_accounts(id uuid PRIMARY KEY REFERENCES profiles(id),name text NOT NULL,email text NOT NULL,phone text NOT NULL,business text DEFAULT '',status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','refused','suspended')),created_at timestamptz DEFAULT now());
ALTER TABLE shop_accounts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);
CREATE TABLE IF NOT EXISTS shop_carts(buyer_id uuid PRIMARY KEY REFERENCES shop_accounts(id),items jsonb NOT NULL);
ALTER TABLE shop_carts ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS shop_listings(product_id uuid PRIMARY KEY REFERENCES products(id),config jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS shop_config(id integer PRIMARY KEY CHECK(id=1),config jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS shop_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),buyer_id uuid REFERENCES shop_accounts(id) NOT NULL,request_id uuid UNIQUE NOT NULL,number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,data jsonb NOT NULL,payment_status text NOT NULL DEFAULT 'pending',status text DEFAULT 'Pedido recebido',expires_at timestamptz NOT NULL,sale_id uuid REFERENCES sales(id),production_order_id uuid REFERENCES orders(id),created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS shop_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES shop_orders(id),user_id uuid REFERENCES profiles(id),type text NOT NULL,details jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS shop_account_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),buyer_id uuid REFERENCES shop_accounts(id),admin_id uuid REFERENCES profiles(id),status text NOT NULL,notes text,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS shop_assets(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES shop_orders(id) NOT NULL,user_id uuid REFERENCES profiles(id),kind text NOT NULL CHECK(kind IN('art','logo','proof')),version integer NOT NULL,filename text NOT NULL,mime text NOT NULL,storage_path text UNIQUE NOT NULL,created_at timestamptz DEFAULT now());
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['shop_accounts','shop_listings','shop_config','shop_orders','shop_events','shop_account_events','shop_assets'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);END LOOP;END $$;
-- Sem escrita direta: toda mutação usa RPC com identidade e regras explícitas.
CREATE OR REPLACE FUNCTION shop_owns(p_order uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM shop_orders WHERE id=p_order AND buyer_id=auth.uid()) $$;
REVOKE ALL ON FUNCTION shop_owns(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION shop_owns(uuid) TO authenticated;
DROP POLICY IF EXISTS shop_asset_read ON shop_assets;
CREATE POLICY shop_asset_read ON shop_assets FOR SELECT TO authenticated USING(is_axl_admin() OR shop_owns(order_id));
GRANT SELECT ON shop_assets TO authenticated;
CREATE OR REPLACE FUNCTION shop_signup_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.raw_user_meta_data->>'axl_shop'='true' THEN
 INSERT INTO profiles(id,name,email,role) VALUES(NEW.id,COALESCE(NEW.raw_user_meta_data->>'name','Comprador'),NEW.email,'COMPRADOR') ON CONFLICT(id) DO NOTHING;
 IF EXISTS(SELECT 1 FROM profiles WHERE id=NEW.id AND role='COMPRADOR') THEN INSERT INTO shop_accounts(id,name,email,phone,business) VALUES(NEW.id,COALESCE(NEW.raw_user_meta_data->>'name','Comprador'),NEW.email,COALESCE(NEW.raw_user_meta_data->>'phone',''),COALESCE(NEW.raw_user_meta_data->>'business','')) ON CONFLICT(id) DO NOTHING;END IF;
END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS axl_shop_signup ON auth.users;
CREATE TRIGGER axl_shop_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION shop_signup_trigger();
CREATE OR REPLACE FUNCTION shop_ready(s jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT COALESCE(length(s->>'business_name')>0 AND length(s->>'business_details')>0 AND length(s->>'support')>0 AND length(s->>'purchase_policy')>0 AND length(s->>'privacy')>0 AND length(s->>'cancellation_policy')>0 AND length(s->>'pix_payload')>0 AND length(s->>'payment_terms')>0 AND (s->>'payment_hours')::integer BETWEEN 1 AND 168 AND jsonb_array_length(s->'delivery')>0,false) $$;
CREATE OR REPLACE FUNCTION shop_listing_ready(l jsonb,s jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT shop_ready(s) AND COALESCE((l->>'price')::integer>0 AND length(l->>'description')>0 AND (l->>'production_days')::integer>=0 AND (l->>'quantity_available')::integer>=0 AND (l->>'personalization'<>'combo' OR jsonb_array_length(l->'components')>0),false) $$;
CREATE OR REPLACE FUNCTION shop_catalog() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('settings',COALESCE((SELECT config FROM shop_config WHERE id=1),'{}'::jsonb),'listings',COALESCE((SELECT jsonb_agg(l.config||jsonb_build_object('name',p.name)) FROM shop_listings l JOIN products p ON p.id=l.product_id WHERE p.active AND (l.config->>'published')::boolean AND shop_listing_ready(l.config,(SELECT config FROM shop_config WHERE id=1))),'[]'::jsonb)) $$;
REVOKE ALL ON FUNCTION shop_catalog() FROM PUBLIC;GRANT EXECUTE ON FUNCTION shop_catalog() TO anon,authenticated;
CREATE OR REPLACE FUNCTION shop_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE result jsonb;BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Faça login.';END IF;
result:=shop_catalog();IF is_axl_admin() THEN result:=result||jsonb_build_object('accounts',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM shop_accounts a),'[]'::jsonb),'accountEvents',COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM shop_account_events a),'[]'::jsonb),'listings',COALESCE((SELECT jsonb_agg(l.config||jsonb_build_object('name',p.name)) FROM shop_listings l JOIN products p ON p.id=l.product_id),'[]'::jsonb));END IF;
RETURN result||jsonb_build_object('cart',COALESCE((SELECT items FROM shop_carts WHERE buyer_id=auth.uid()),'[]'::jsonb),'account',(SELECT to_jsonb(a) FROM shop_accounts a WHERE id=auth.uid()),'orders',COALESCE((SELECT jsonb_agg(to_jsonb(o)||jsonb_build_object('status',COALESCE((SELECT status FROM orders WHERE id=o.production_order_id),o.status),'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'type',e.type,'created_at',e.created_at)) FROM shop_events e WHERE e.order_id=o.id),'[]'::jsonb),'assets',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'version',a.version,'filename',a.filename,'created_at',a.created_at)) FROM shop_assets a WHERE a.order_id=o.id),'[]'::jsonb))) FROM shop_orders o WHERE o.buyer_id=auth.uid() OR is_axl_admin()),'[]'::jsonb));END $$;
REVOKE ALL ON FUNCTION shop_state() FROM PUBLIC;GRANT EXECUTE ON FUNCTION shop_state() TO authenticated;
CREATE OR REPLACE FUNCTION shop_mutate(a text,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid(); admin boolean:=is_axl_admin(); rid uuid; s jsonb; l jsonb; v jsonb; line jsonb; item jsonb; items jsonb:='[]'; delivery jsonb; total bigint:=0; price integer; q integer; committed integer; sameqty integer; tier jsonb; ord shop_orders%ROWTYPE; dat jsonb; result jsonb; acct shop_accounts%ROWTYPE; art shop_assets%ROWTYPE; prod uuid; n bigint; stock inventory_items%ROWTYPE; inv uuid; reserved numeric; raw_items jsonb:='[]'; BEGIN
IF uid IS NULL THEN RAISE EXCEPTION 'Faça login.';END IF;PERFORM pg_advisory_xact_lock(184771);
SELECT config INTO s FROM shop_config WHERE id=1;
IF a='cart' THEN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=uid AND role='COMPRADOR') OR jsonb_array_length(d->'items')>30 THEN RAISE EXCEPTION 'Carrinho inválido.';END IF;FOR item IN SELECT value FROM jsonb_array_elements(d->'items') LOOP IF (item->>'quantity')::integer NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Quantidade inválida.';END IF;PERFORM (item->>'product_id')::uuid;END LOOP;INSERT INTO shop_carts VALUES(uid,d->'items') ON CONFLICT(buyer_id) DO UPDATE SET items=excluded.items;RETURN jsonb_build_object('ok',true);
ELSIF a='link_company' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;IF length(trim(d->>'notes'))<3 THEN RAISE EXCEPTION 'Registre a verificação da associação.';END IF;UPDATE shop_accounts SET company_id=NULLIF(d->>'company_id','')::uuid WHERE id=(d->>'id')::uuid;INSERT INTO shop_account_events(buyer_id,admin_id,status,notes) VALUES((d->>'id')::uuid,uid,'Associação verificada',d->>'notes');PERFORM axl_audit('Associação comprador/CRM verificada',(d->>'id')::uuid,'shop_accounts');RETURN jsonb_build_object('ok',true);
ELSIF a='account' THEN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=uid AND role='COMPRADOR') OR length(trim(d->>'name'))<2 OR length(d->>'phone')<8 THEN RAISE EXCEPTION 'Dados de conta inválidos.';END IF;UPDATE shop_accounts SET name=d->>'name',phone=d->>'phone',business=COALESCE(d->>'business','') WHERE id=uid;RETURN jsonb_build_object('ok',true);
ELSIF a='settings' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;
 IF EXISTS(SELECT 1 FROM shop_listings WHERE (config->>'published')::boolean AND NOT shop_listing_ready(config,d)) THEN RAISE EXCEPTION 'Despublique os produtos antes de remover condições obrigatórias.';END IF;
 INSERT INTO shop_config VALUES(1,d) ON CONFLICT(id) DO UPDATE SET config=excluded.config;PERFORM axl_audit('Condições da loja alteradas',uid,'shop_config');RETURN jsonb_build_object('ok',true);
ELSIF a='listing' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;rid:=(d->>'product_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM products WHERE id=rid) THEN RAISE EXCEPTION 'Produto inexistente.';END IF;
 IF (d->>'availability')='finished' AND NOT EXISTS(SELECT 1 FROM products WHERE id=rid AND stock_inventory_id IS NOT NULL) THEN RAISE EXCEPTION 'Vincule o produto ao estoque pronto.';END IF;
 IF COALESCE((d->>'published')::boolean,false) AND NOT shop_listing_ready(d,s) THEN RAISE EXCEPTION 'Preço, prazo, disponibilidade e condições incompletos.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(d->'components') LOOP IF NOT EXISTS(SELECT 1 FROM products WHERE id=(item->>'product_id')::uuid) OR (item->>'quantity')::integer NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Combo inválido.';END IF;END LOOP;
 INSERT INTO shop_listings VALUES(rid,d) ON CONFLICT(product_id) DO UPDATE SET config=excluded.config;PERFORM axl_audit('Produto da loja configurado',rid,'shop_listings');RETURN jsonb_build_object('ok',true);
ELSIF a='approval' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;rid:=(d->>'id')::uuid;
 IF d->>'status' NOT IN('pending','approved','refused','suspended') THEN RAISE EXCEPTION 'Estado inválido.';END IF;
 UPDATE shop_accounts SET status=d->>'status' WHERE id=rid;IF NOT FOUND THEN RAISE EXCEPTION 'Comprador inexistente.';END IF;
 INSERT INTO shop_account_events(buyer_id,admin_id,status,notes) VALUES(rid,uid,d->>'status',d->>'notes');PERFORM axl_audit('Cadastro comprador '||(d->>'status'),rid,'shop_accounts');RETURN jsonb_build_object('ok',true);
ELSIF a='checkout' THEN
 IF NOT EXISTS(SELECT 1 FROM profiles p JOIN shop_accounts c ON c.id=p.id WHERE p.id=uid AND p.role='COMPRADOR' AND c.status='approved') THEN RAISE EXCEPTION 'Seu cadastro precisa estar aprovado para comprar.';END IF;
 SELECT id,number INTO rid,n FROM shop_orders WHERE buyer_id=uid AND request_id=(d->>'request_id')::uuid;IF rid IS NOT NULL THEN IF EXISTS(SELECT 1 FROM shop_orders WHERE id=rid AND data->'checkout_input' IS NOT NULL AND data->'checkout_input'<>d) THEN RAISE EXCEPTION 'Esta operação já gerou pedido com outros dados. Consulte Meus pedidos.';END IF;RETURN jsonb_build_object('id',rid,'number',n);END IF;
 SELECT value INTO delivery FROM jsonb_array_elements(s->'delivery') WHERE value->>'id'=d->>'delivery_id';
 IF delivery IS NULL OR delivery->>'fee' IS NULL OR delivery->>'transport_days' IS NULL OR length(delivery->>'area')=0 OR ((delivery->>'needs_address')::boolean AND length(trim(COALESCE(d->>'address','')))=0) THEN RAISE EXCEPTION 'Entrega/endereço/frete incompletos. Solicite orçamento.';END IF;
 total:=(delivery->>'fee')::integer;
 IF jsonb_array_length(d->'items') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Itens inválidos.';END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(d->'items') LOOP
  rid:=(line->>'product_id')::uuid;q:=(line->>'quantity')::integer;IF q NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Quantidade inválida.';END IF;
  SELECT sl.config||jsonb_build_object('name',p.name) INTO l FROM shop_listings sl JOIN products p ON p.id=sl.product_id WHERE sl.product_id=rid AND p.active;
  IF l IS NULL OR NOT COALESCE((l->>'published')::boolean,false) OR NOT shop_listing_ready(l,s) THEN RAISE EXCEPTION 'Produto indisponível ou incompleto.';END IF;
  IF jsonb_array_length(l->'options')>0 AND NOT (l->'options' ? (line->>'option')) THEN RAISE EXCEPTION 'Selecione um modelo válido.';END IF;
  SELECT COALESCE(sum((x->>'quantity')::integer),0) INTO committed FROM shop_orders o CROSS JOIN LATERAL jsonb_array_elements(o.data->'items') x WHERE o.status<>'Cancelado' AND (o.payment_status='confirmed' OR o.expires_at>now()) AND x->>'product_id'=rid::text;
  SELECT sum((x->>'quantity')::integer) INTO sameqty FROM jsonb_array_elements(d->'items') x WHERE x->>'product_id'=rid::text;
  IF committed+sameqty>(l->>'quantity_available')::integer THEN RAISE EXCEPTION 'Disponibilidade/capacidade insuficiente.';END IF;
  IF l->>'availability'='finished' THEN
   SELECT stock_inventory_id INTO inv FROM products WHERE id=rid;SELECT * INTO stock FROM inventory_items WHERE id=inv;
   SELECT COALESCE(sum(quantity),0) INTO reserved FROM inventory_reservations WHERE inventory_id=inv AND status='reserved';
   IF NOT COALESCE(stock.quantity_known,false) OR stock.quantity-reserved-committed<sameqty THEN RAISE EXCEPTION 'Estoque pronto não confirmado ou insuficiente.';END IF;
  END IF;
  price:=(l->>'price')::integer;FOR tier IN SELECT value FROM jsonb_array_elements(l->'tiers') ORDER BY (value->>'minimum')::integer LOOP IF q>=(tier->>'minimum')::integer THEN price:=(tier->>'price')::integer;END IF;END LOOP;
  IF price<=0 OR price>100000000 THEN RAISE EXCEPTION 'Preço inválido.';END IF;
  total:=total+price*q;items:=items||jsonb_build_array(line||jsonb_build_object('name',l->>'name','unit_price',price,'total',price*q,'kind',l->>'personalization','availability',l->>'availability','components',l->'components','production_days',l->'production_days'));
 END LOOP;
 IF d->>'expected_total' IS NOT NULL AND (d->>'expected_total')::integer<>total THEN RAISE EXCEPTION 'Preço atualizado. Confira o catálogo e tente novamente.';END IF;
 IF total<=0 OR total>100000000 THEN RAISE EXCEPTION 'Total inválido.';END IF;
 rid:=gen_random_uuid();INSERT INTO shop_orders(id,buyer_id,request_id,data,expires_at) VALUES(rid,uid,(d->>'request_id')::uuid,jsonb_build_object('checkout_input',d,'items',items,'total',total,'delivery',delivery,'address',d->>'address','origin','Loja online','payment_terms',s->>'payment_terms','pix_payload',s->>'pix_payload','art_approved',false),now()+make_interval(hours=>(s->>'payment_hours')::integer)) RETURNING number INTO n;
 INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Pedido colocado — aguardando pagamento','{}');RETURN jsonb_build_object('id',rid,'number',n);
END IF;
rid:=(d->>'id')::uuid;SELECT * INTO ord FROM shop_orders WHERE id=rid AND (buyer_id=uid OR admin);IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.';END IF;dat:=ord.data;
IF a='payment_confirm' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;
 IF NOT COALESCE((d->>'confirmed')::boolean,false) THEN RAISE EXCEPTION 'Confirme a conciliação real do recebimento.';END IF;PERFORM (d->>'date')::date;
 IF ord.payment_status='confirmed' THEN RETURN jsonb_build_object('id',rid);END IF;
 IF ord.status='Cancelado' OR ord.expires_at<now() THEN RAISE EXCEPTION 'Pedido cancelado/expirado. Revise disponibilidade antes de nova compra.';END IF;
 SELECT * INTO acct FROM shop_accounts WHERE id=ord.buyer_id;
 FOR item IN SELECT value FROM jsonb_array_elements(dat->'items') LOOP
  IF jsonb_array_length(item->'components')>0 THEN FOR v IN SELECT value FROM jsonb_array_elements(item->'components') LOOP raw_items:=raw_items||jsonb_build_array(jsonb_build_object('product_id',v->>'product_id','quantity',(v->>'quantity')::integer*(item->>'quantity')::integer,'line_total',NULL,'from_stock',false));END LOOP;
  ELSE raw_items:=raw_items||jsonb_build_array(jsonb_build_object('product_id',item->>'product_id','quantity',(item->>'quantity')::integer,'line_total',NULL,'from_stock',item->>'availability'='finished'));END IF;
 END LOOP;
 result:=axl_ops('quick_sale',jsonb_build_object('request_id',rid,'defer_production',true,'company_id',acct.company_id,'name',COALESCE(NULLIF(acct.business,''),acct.name),'new_homonym',true,'date',d->>'date','total',(dat->>'total')::integer,'payment_status','received','paid',(dat->>'total')::integer,'method','Pix','notes','Loja online · '||rid,'items',raw_items));
 IF acct.company_id IS NULL THEN UPDATE shop_accounts SET company_id=(result->>'company_id')::uuid WHERE id=acct.id;END IF;
 SELECT id INTO prod FROM orders WHERE sale_id=(result->>'id')::uuid;UPDATE shop_orders SET payment_status='confirmed',sale_id=(result->>'id')::uuid,production_order_id=prod WHERE id=rid;
 IF prod IS NOT NULL THEN UPDATE orders SET status='Arte pendente' WHERE id=prod AND produced_at IS NULL;END IF;
 INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Pagamento conciliado',jsonb_build_object('date',d->>'date','total',dat->>'total'));PERFORM axl_audit('Loja: pagamento confirmado',rid,'shop_orders');
ELSIF a='personalization' THEN
 IF ord.status='Cancelado' OR EXISTS(SELECT 1 FROM orders WHERE id=ord.production_order_id AND produced_at IS NOT NULL) THEN RAISE EXCEPTION 'Pedido encerrado ou em produção. Solicite alteração.';END IF;
 q:=(d->>'index')::integer;IF q<0 OR q>=jsonb_array_length(dat->'items') THEN RAISE EXCEPTION 'Item inexistente.';END IF;
 dat:=jsonb_set(dat,ARRAY['items',q::text,'personalization'],d->'values');dat:=jsonb_set(dat,'{art_approved}','false');UPDATE shop_orders SET data=dat WHERE id=rid;
 UPDATE orders SET status='Arte pendente' WHERE id=ord.production_order_id AND produced_at IS NULL;
 INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Personalização atualizada',jsonb_build_object('index',q));
ELSIF a='art_approve' THEN
 IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=uid AND role='COMPRADOR') THEN RAISE EXCEPTION 'A aprovação deve ser feita pelo comprador.';END IF;
 SELECT * INTO art FROM shop_assets WHERE order_id=rid AND kind='art' ORDER BY version DESC LIMIT 1;
 IF art.id IS NULL OR art.id<>(d->>'asset_id')::uuid THEN RAISE EXCEPTION 'Abra e aprove a versão atual da arte.';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(dat->'items') LOOP
  IF (item->>'kind'='google' AND (length(COALESCE(item->'personalization'->>'google_url',''))=0 OR item->'personalization'->>'google_confirmed' IS DISTINCT FROM 'true')) OR (item->>'kind'='whatsapp' AND COALESCE(item->'personalization'->>'phone','')!~ '^\+?[0-9]{10,15}$') OR (item->>'kind'='instagram' AND length(COALESCE(item->'personalization'->>'instagram',''))=0) OR (item->>'kind'='pix' AND length(COALESCE(item->'personalization'->>'pix_payload',''))=0) OR (item->>'kind' IN('combo','table') AND length(trim(COALESCE(item->'personalization'->>'notes','')))=0) THEN RAISE EXCEPTION 'Complete a personalização antes de aprovar.';END IF;
 END LOOP;
 dat:=dat||jsonb_build_object('art_approved',true,'art_asset_id',art.id,'art_version',art.version,'art_approved_at',now());UPDATE shop_orders SET data=dat WHERE id=rid;UPDATE orders SET status='Arte aprovada' WHERE id=ord.production_order_id AND produced_at IS NULL;
 INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Arte aprovada',jsonb_build_object('version',art.version));
ELSIF a IN('request_change','request_cancel') THEN
 IF length(trim(d->>'reason'))<3 THEN RAISE EXCEPTION 'Informe o motivo.';END IF;INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,CASE WHEN a='request_cancel' THEN 'Cancelamento solicitado' ELSE 'Alteração solicitada' END,jsonb_build_object('reason',d->>'reason'));
ELSIF a='cancel' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;
 IF ord.payment_status='confirmed' THEN RAISE EXCEPTION 'Pedido pago: concilie estorno antes de cancelar; produção não será revertida.';END IF;
 IF length(trim(d->>'reason'))<3 THEN RAISE EXCEPTION 'Informe motivo.';END IF;UPDATE shop_orders SET status='Cancelado' WHERE id=rid;INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Pedido cancelado',jsonb_build_object('reason',d->>'reason'));
ELSIF a='refund' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;PERFORM (d->>'date')::date;
 IF NOT COALESCE((d->>'confirmed')::boolean,false) OR length(trim(d->>'reason'))<3 THEN RAISE EXCEPTION 'Confirme estorno real e informe o motivo.';END IF;
 IF ord.payment_status='refunded' THEN RETURN jsonb_build_object('id',rid);END IF;
 IF ord.payment_status<>'confirmed' THEN RAISE EXCEPTION 'Somente pagamento conciliado pode ser estornado.';END IF;
 INSERT INTO expenses(description,category,amount,date,paid,paid_at) VALUES('Estorno integral loja #'||ord.number,'Estorno de venda',(dat->>'total')::integer,(d->>'date')::date,true,now());
 IF ord.production_order_id IS NOT NULL THEN PERFORM axl_ops('order_update',jsonb_build_object('id',ord.production_order_id,'status','Cancelado','notes',d->>'reason'));END IF;
 UPDATE shop_orders SET payment_status='refunded',status='Cancelado' WHERE id=rid;INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Estorno integral conciliado',jsonb_build_object('date',d->>'date','amount',dat->>'total','reason',d->>'reason'));PERFORM axl_audit('Estorno loja conciliado',rid,'shop_orders');
ELSIF a='delivery' THEN
 IF NOT admin THEN RAISE EXCEPTION 'Acesso restrito ao administrador.';END IF;UPDATE shop_orders SET data=jsonb_set(data,'{tracking}',to_jsonb(d->>'tracking')) WHERE id=rid;INSERT INTO shop_events(order_id,user_id,type,details) VALUES(rid,uid,'Rastreamento atualizado','{}');
ELSE RAISE EXCEPTION 'Operação da loja não reconhecida.';END IF;
RETURN jsonb_build_object('id',rid);END $$;
REVOKE ALL ON FUNCTION shop_mutate(text,jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION shop_mutate(text,jsonb) TO authenticated;
-- Produção da loja exige pagamento e aprovação da versão atual, também pela gestão/API.
CREATE OR REPLACE FUNCTION shop_production_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NEW.item_snapshot IS DISTINCT FROM OLD.item_snapshot THEN UPDATE shop_orders SET data=jsonb_set(data,'{art_approved}','false') WHERE production_order_id=NEW.id;END IF;
IF (NEW.produced_at IS NOT NULL AND OLD.produced_at IS NULL) OR (NEW.status IN('Produção','Pronto para entrega','Saiu para entrega','Entregue') AND NEW.status IS DISTINCT FROM OLD.status) THEN
 IF EXISTS(SELECT 1 FROM shop_orders s WHERE s.production_order_id=NEW.id AND (s.payment_status<>'confirmed' OR NOT COALESCE((s.data->>'art_approved')::boolean,false))) THEN RAISE EXCEPTION 'Pedido da loja requer pagamento conciliado e arte aprovada pelo comprador.';END IF;
END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS shop_guard ON orders;CREATE TRIGGER shop_guard BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION shop_production_guard();
CREATE OR REPLACE FUNCTION shop_asset_register(d jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE rid uuid; oid uuid:=(d->>'order_id')::uuid;k text:=d->>'kind';BEGIN
IF auth.uid() IS NULL OR NOT (is_axl_admin() OR shop_owns(oid)) THEN RAISE EXCEPTION 'Pedido não encontrado.';END IF;
IF k='art' AND EXISTS(SELECT 1 FROM orders WHERE id=(SELECT production_order_id FROM shop_orders WHERE id=oid) AND produced_at IS NOT NULL) THEN RAISE EXCEPTION 'Produção já iniciada. Solicite alteração formal.';END IF;
IF k NOT IN('art','logo','proof') OR (k='art' AND NOT is_axl_admin()) THEN RAISE EXCEPTION 'Tipo de arquivo não autorizado.';END IF;
IF d->>'storage_path' NOT LIKE 'shop/'||oid::text||'/%' OR d->>'mime' NOT IN('image/png','image/jpeg','image/webp','application/pdf') THEN RAISE EXCEPTION 'Arquivo inválido.';END IF;
PERFORM pg_advisory_xact_lock(184771);
INSERT INTO shop_assets(order_id,user_id,kind,version,filename,mime,storage_path) SELECT oid,auth.uid(),k,COALESCE(max(version),0)+1,d->>'filename',d->>'mime',d->>'storage_path' FROM shop_assets WHERE order_id=oid AND kind=k RETURNING id INTO rid;
IF k='art' THEN UPDATE shop_orders SET data=jsonb_set(data,'{art_approved}','false') WHERE id=oid;UPDATE orders SET status='Aguardando aprovação' WHERE id=(SELECT production_order_id FROM shop_orders WHERE id=oid) AND produced_at IS NULL;END IF;
INSERT INTO shop_events(order_id,user_id,type,details) VALUES(oid,auth.uid(),CASE k WHEN 'art' THEN 'Nova versão da arte' WHEN 'proof' THEN 'Comprovante enviado — conciliação pendente' ELSE 'Logo enviado' END,'{}');RETURN rid;END $$;
REVOKE ALL ON FUNCTION shop_asset_register(jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION shop_asset_register(jsonb) TO authenticated;
-- Bucket existente privado. O comprador acessa só pastas de seus próprios pedidos.
CREATE OR REPLACE FUNCTION shop_storage_owned(p text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF p !~ '^shop/[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp|pdf)$' THEN RETURN false;END IF;RETURN shop_owns(split_part(p,'/',2)::uuid);EXCEPTION WHEN invalid_text_representation THEN RETURN false;END $$;
REVOKE ALL ON FUNCTION shop_storage_owned(text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION shop_storage_owned(text) TO authenticated;
DROP POLICY IF EXISTS shop_storage_read ON storage.objects;CREATE POLICY shop_storage_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='axl-files' AND shop_storage_owned(name));
DROP POLICY IF EXISTS shop_storage_insert ON storage.objects;CREATE POLICY shop_storage_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='axl-files' AND shop_storage_owned(name));
COMMIT;
