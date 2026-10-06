-- AXL rua v2: migração aditiva. Aplicar após supabase-import.sql. Não apaga histórico.
BEGIN;
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
COMMIT;
