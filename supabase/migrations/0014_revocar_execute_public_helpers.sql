-- Las funciones se crean con EXECUTE otorgado a PUBLIC por defecto en Postgres — revocar solo
-- de `anon` no alcanza porque anon sigue heredando el grant de PUBLIC. Se revoca de PUBLIC y
-- se re-otorga solo a `authenticated`, que sí las necesita: las policies RLS de las 15 tablas
-- llaman rol_actual()/es_admin()/es_activo() dentro de su USING/WITH CHECK, y eso requiere que
-- el rol que ejecuta la consulta (authenticated) tenga EXECUTE sobre ellas.

revoke execute on function public.rol_actual() from public;
revoke execute on function public.es_admin() from public;
revoke execute on function public.es_activo() from public;

grant execute on function public.rol_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.es_activo() to authenticated;
