-- Las funciones de trigger (handle_new_user, movimientos_inventario_operativo_insert) no
-- necesitan ser invocables directo vía /rest/v1/rpc/... — solo las usan los triggers, que
-- corren con los privilegios de su dueño sin necesitar EXECUTE del rol que dispara el evento.
-- El advisor de seguridad las marcaba como "Public Can Execute SECURITY DEFINER Function".

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.movimientos_inventario_operativo_insert() from public, anon, authenticated;

-- rol_actual/es_admin/es_activo sí deben quedar ejecutables por authenticated (las usan las
-- policies y potencialmente el frontend para resolver el rol propio) pero no por anon, que
-- nunca tiene sesión y solo obtendría NULL/false de todas formas — se revoca por prolijidad.
revoke execute on function public.rol_actual() from anon;
revoke execute on function public.es_admin() from anon;
revoke execute on function public.es_activo() from anon;
