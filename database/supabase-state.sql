-- Aplicar DEPOIS de supabase-runtime.sql. Uma leitura autenticada, sob RLS.
BEGIN;
CREATE OR REPLACE FUNCTION public.axl_state() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
BEGIN
IF NOT public.is_axl_admin() THEN RAISE EXCEPTION 'Acesso restrito ao administrador.'; END IF;
RETURN jsonb_build_object(
'profiles',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY name) FROM (SELECT id,name,email,role,created_at FROM public.profiles) p),'[]'::jsonb),
'companies',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.name) FROM public.companies c WHERE deleted_at IS NULL),'[]'::jsonb),
'products',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name) FROM public.products p WHERE deleted_at IS NULL),'[]'::jsonb),
'sales',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.date DESC,s.number DESC) FROM (SELECT s.*,c.name company_name,COALESCE((SELECT sum(p.amount) FROM public.payments p WHERE p.sale_id=s.id),0) paid FROM public.sales s JOIN public.companies c ON c.id=s.company_id WHERE s.cancelled_at IS NULL) s),'[]'::jsonb),
'saleItems',COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM public.sale_items i),'[]'::jsonb),
'payments',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.date DESC) FROM public.payments p),'[]'::jsonb),
'orders',COALESCE((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC) FROM (SELECT o.*,s.number,c.name company_name FROM public.orders o JOIN public.sales s ON s.id=o.sale_id JOIN public.companies c ON c.id=s.company_id) o),'[]'::jsonb),
'inventory',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.name) FROM public.inventory_items i),'[]'::jsonb),
'activities',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.activities a),'[]'::jsonb),
'followups',COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.date) FROM (SELECT f.*,c.name company_name FROM public.followups f JOIN public.companies c ON c.id=f.company_id) f),'[]'::jsonb),
'salespeople',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.name) FROM public.salespeople s WHERE deleted_at IS NULL),'[]'::jsonb),
'expenses',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.date DESC) FROM public.expenses e),'[]'::jsonb),
'goals',COALESCE((SELECT jsonb_agg(to_jsonb(g)) FROM public.goals g),'[]'::jsonb),
'components',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.product_components c),'[]'::jsonb),
'movements',COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC) FROM (SELECT m.*,i.name FROM public.inventory_movements m JOIN public.inventory_items i ON i.id=m.inventory_id) m),'[]'::jsonb),
'routes',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.date DESC) FROM public.routes r),'[]'::jsonb),
'stops',COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.position) FROM (SELECT s.*,c.name,c.address,c.city FROM public.route_stops s JOIN public.companies c ON c.id=s.company_id) s),'[]'::jsonb),
'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT a.*,p.name FROM public.audit_logs a JOIN public.profiles p ON p.id=a.user_id ORDER BY a.created_at DESC LIMIT 100) a),'[]'::jsonb),
'weights',COALESCE((SELECT value FROM public.settings WHERE key='score_weights'),'{"rating":25,"reviews":25,"phone":10,"website":10,"segment":15,"contact":10,"other":5}'::jsonb)
);
END $$;
REVOKE ALL ON FUNCTION public.axl_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.axl_state() TO authenticated;
-- Permissões explícitas; a RLS continua a decidir quais linhas cada perfil acessa.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.profiles,public.salespeople,public.territories,public.companies,public.leads,public.customers,public.contacts,public.activities,public.followups,public.vendors,public.inventory_items,public.products,public.product_components,public.sales,public.sale_items,public.payments,public.orders,public.order_items,public.production_tasks,public.inventory_movements,public.purchases,public.purchase_items,public.expenses,public.commissions,public.goals,public.google_places,public.ranking_checks,public.routes,public.route_stops,public.attachments,public.opportunity_scores,public.settings,public.audit_logs TO authenticated;
GRANT USAGE ON SEQUENCE public.sales_number_seq TO authenticated;
COMMIT;
