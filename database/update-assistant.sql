-- Aplicar após update-links-shop.sql. Não autoriza nenhuma conexão automaticamente.
BEGIN;
CREATE TABLE IF NOT EXISTS assistant_clients(id text PRIMARY KEY,name text NOT NULL,redirect_uris jsonb NOT NULL,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS assistant_codes(hash text PRIMARY KEY,user_id uuid REFERENCES profiles(id),client_id text REFERENCES assistant_clients(id),redirect_uri text,challenge text,scope text,resource text,expires_at timestamptz);
CREATE TABLE IF NOT EXISTS assistant_tokens(hash text PRIMARY KEY,id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,user_id uuid REFERENCES profiles(id),client_id text REFERENCES assistant_clients(id),scope text,resource text,expires_at timestamptz,revoked boolean DEFAULT false,created_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS assistant_operations(user_id uuid REFERENCES profiles(id),request_id uuid,action text,payload jsonb,result jsonb,created_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,request_id));
DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['assistant_clients','assistant_codes','assistant_tokens','assistant_operations'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);END LOOP;END $$;
CREATE OR REPLACE FUNCTION assistant_register(d jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE u jsonb;BEGIN
PERFORM pg_advisory_xact_lock(184772);IF (SELECT count(*) FROM assistant_clients)>1000 THEN RAISE EXCEPTION 'Limite de conexões atingido.';END IF;
IF d->>'id' !~ '^[A-Za-z0-9_-]{43}$' OR jsonb_array_length(d->'redirect_uris') NOT BETWEEN 1 AND 10 THEN RAISE EXCEPTION 'Cliente inválido.';END IF;
FOR u IN SELECT value FROM jsonb_array_elements(d->'redirect_uris') LOOP IF u#>>'{}' !~ '^https://[A-Za-z0-9.-]+(/|$)' OR u#>>'{}' ~ '[#@]' THEN RAISE EXCEPTION 'Redirecionamento inválido.';END IF;END LOOP;
INSERT INTO assistant_clients VALUES(d->>'id',COALESCE(d->>'name','Assistente'),d->'redirect_uris',now());END $$;
CREATE OR REPLACE FUNCTION assistant_issue(d jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF NOT is_axl_member() THEN RAISE EXCEPTION 'Acesso não autorizado.';END IF;
IF d->>'scope' NOT IN('axl:read','axl:read axl:write') OR d->>'code_challenge' !~ '^[A-Za-z0-9_-]{43}$' OR d->>'hash' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Autorização inválida.';END IF;
IF NOT EXISTS(SELECT 1 FROM assistant_clients WHERE id=d->>'client_id' AND redirect_uris ? (d->>'redirect_uri')) THEN RAISE EXCEPTION 'Redirecionamento não registrado.';END IF;
DELETE FROM assistant_codes WHERE expires_at<now();INSERT INTO assistant_codes VALUES(d->>'hash',auth.uid(),d->>'client_id',d->>'redirect_uri',d->>'code_challenge',d->>'scope',d->>'resource',now()+interval '5 minutes');END $$;
CREATE OR REPLACE FUNCTION assistant_exchange(d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE c assistant_codes%ROWTYPE;BEGIN
IF d->>'token_hash' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Token inválido.';END IF;
SELECT * INTO c FROM assistant_codes WHERE hash=d->>'code_hash' FOR UPDATE;
IF NOT FOUND OR c.expires_at<now() OR c.client_id IS DISTINCT FROM d->>'client_id' OR c.redirect_uri IS DISTINCT FROM d->>'redirect_uri' OR c.resource IS DISTINCT FROM d->>'resource' OR c.challenge IS DISTINCT FROM d->>'challenge' THEN RAISE EXCEPTION 'Código inválido/expirado.';END IF;
IF NOT EXISTS(SELECT 1 FROM profiles WHERE id=c.user_id AND role IN('ADMIN','VENDEDOR')) THEN RAISE EXCEPTION 'Perfil revogado.';END IF;
DELETE FROM assistant_codes WHERE hash=c.hash;INSERT INTO assistant_tokens(hash,user_id,client_id,scope,resource,expires_at) VALUES(d->>'token_hash',c.user_id,c.client_id,c.scope,c.resource,now()+interval '1 hour');RETURN jsonb_build_object('scope',c.scope);END $$;
CREATE OR REPLACE FUNCTION assistant_identity(h text,r text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT jsonb_build_object('user',jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'role',p.role),'scope',t.scope) FROM assistant_tokens t JOIN profiles p ON p.id=t.user_id WHERE t.hash=h AND t.resource=r AND t.expires_at>now() AND NOT t.revoked AND p.role IN('ADMIN','VENDEDOR') $$;
CREATE OR REPLACE FUNCTION assistant_connections(revoke text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT is_axl_member() THEN RAISE EXCEPTION 'Acesso não autorizado.';END IF;IF revoke IS NOT NULL THEN UPDATE assistant_tokens SET revoked=true WHERE id::text=revoke AND user_id=auth.uid();END IF;RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'name',c.name,'scope',t.scope,'expires_at',t.expires_at,'revoked',t.revoked,'created_at',t.created_at)) FROM assistant_tokens t JOIN assistant_clients c ON c.id=t.client_id WHERE t.user_id=auth.uid()),'[]'::jsonb);END $$;
CREATE OR REPLACE FUNCTION assistant_execute(h text,r text,a text,d jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t assistant_tokens%ROWTYPE; req uuid; result jsonb; previous assistant_operations%ROWTYPE; action text; ent uuid;BEGIN
SELECT * INTO t FROM assistant_tokens WHERE hash=h AND resource=r AND expires_at>now() AND NOT revoked;
IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM profiles WHERE id=t.user_id AND role IN('ADMIN','VENDEDOR')) THEN RAISE EXCEPTION 'Conexão revogada ou expirada.';END IF;
PERFORM set_config('request.jwt.claim.sub',t.user_id::text,true);
IF a='buscar_empresa' THEN RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'city',city,'status',status)) FROM companies WHERE deleted_at IS NULL AND ((d->>'id' IS NOT NULL AND id=(d->>'id')::uuid) OR (d->>'id' IS NULL AND name ILIKE '%'||COALESCE(d->>'name','')||'%'))),'[]'::jsonb);END IF;
IF a='consultar_resumo' THEN RETURN jsonb_build_object('sales',COALESCE((SELECT sum(total) FROM sales),0),'received',COALESCE((SELECT sum(amount) FROM payments),0),'orders',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'status',status)) FROM orders WHERE status NOT IN('Entregue','Cancelado')),'[]'::jsonb),'inventory',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'quantity',quantity,'quantity_known',quantity_known)) FROM inventory_items),'[]'::jsonb));END IF;
req:=(d->>'request_id')::uuid;IF req IS NULL THEN RAISE EXCEPTION 'Informe identificador da operação.';END IF;
IF a='consultar_operacao' THEN RETURN (SELECT result FROM assistant_operations WHERE user_id=t.user_id AND request_id=req);END IF;
IF position('axl:write' IN t.scope)=0 THEN RAISE EXCEPTION 'Conexão autorizada somente para leitura.';END IF;
PERFORM pg_advisory_xact_lock(184771);SELECT * INTO previous FROM assistant_operations WHERE user_id=t.user_id AND request_id=req;
IF FOUND THEN IF previous.action<>a OR previous.payload<>d THEN RAISE EXCEPTION 'Identificador já usado com dados diferentes.';END IF;RETURN previous.result;END IF;
CASE a WHEN 'registrar_venda' THEN action:='quick_sale';WHEN 'registrar_recebimento' THEN action:='payment';WHEN 'registrar_despesa' THEN action:='expense';WHEN 'registrar_compra' THEN action:='lot_purchase';WHEN 'atualizar_pedido' THEN action:='order_update';WHEN 'registrar_contato' THEN action:='contact';WHEN 'confirmar_empresa' THEN action:='maps_company';ELSE RAISE EXCEPTION 'Ferramenta não autorizada.';END CASE;
IF action='maps_company' THEN result:=axl_maps_save(d);
ELSIF action IN('payment','expense') THEN result:=axl_mutate(action,d);
ELSE result:=axl_ops(action,d);END IF;
INSERT INTO assistant_operations VALUES(t.user_id,req,a,d,result,now());
ent:=NULLIF(result->>'id','')::uuid;INSERT INTO audit_logs(user_id,action,entity_id,entity_type,metadata) VALUES(t.user_id,'Assistente · '||a,ent,'assistant_operations',jsonb_build_object('origin','Assistente','request_id',req,'fields',ARRAY(SELECT jsonb_object_keys(d))));RETURN result;END $$;
REVOKE ALL ON FUNCTION assistant_register(jsonb),assistant_issue(jsonb),assistant_exchange(jsonb),assistant_identity(text,text),assistant_connections(text),assistant_execute(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assistant_register(jsonb),assistant_exchange(jsonb),assistant_identity(text,text),assistant_execute(text,text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION assistant_issue(jsonb),assistant_connections(text) TO authenticated;
COMMIT;
