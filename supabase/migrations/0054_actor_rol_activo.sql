-- Hotfix de 0053.
--
-- 0053 eliminó `perfiles.rol` y reescribió `interno.rol_actual()` / `interno.es_admin()` para
-- leer `rol_activo` — pero NO tocó `interno.actor()` (bitácora, 0044), que seguía haciendo
-- `select p.rol from public.perfiles`. Esa función la invoca `interno.bitacora_trigger()` en cada
-- escritura instrumentada (ordenes, ventas, cuentas, estancias_parqueadero, turnos_caja,
-- precios_*, tarifas_parqueadero, productos, movimientos_inventario, configuracion), así que
-- tras 0053 CUALQUIER UPDATE de esas tablas fallaba en producción con
-- `column p.rol does not exist` — "Finalizar lavado", cobro, anulación, reasignación, ventas,
-- cierre de turno, etc.
--
-- `usuario_rol` en el jsonb de `actor()` pasa a ser el rol *activo* de la cuenta (mismo criterio
-- que el resto de helpers de 0053). El histórico de bitácora ya escrito no se toca.
create or replace function interno.actor()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  with u as (
    select p.id, p.nombre, p.rol_activo as rol from public.perfiles p where p.id = auth.uid()
  ),
  persona as (
    select po.id, po.nombre
    from public.turnos_caja t
    join public.personal_operativo po on po.id = t.responsable_actual_persona_id
    where not t.cerrado and t.rol = interno.rol_actual()
    limit 1
  )
  select jsonb_build_object(
    'usuario_id',     (select id from u),
    'usuario_nombre', (select nombre from u),
    'usuario_rol',    (select rol from u),
    'persona_id',     (select id from persona),
    'persona_nombre', (select nombre from persona)
  );
$function$;
