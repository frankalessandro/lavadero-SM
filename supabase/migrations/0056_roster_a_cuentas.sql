-- El roster deja de existir: la cuenta ES la persona.
--
-- 0043 creó `personal_operativo` porque había UNA cuenta de Auth por rol, compartida, y la
-- persona real solo existía como texto tecleado (13 grafías para 3 personas). 0053 y 0055
-- cambiaron esa premisa de raíz: ahora hay una cuenta individual por persona, con 1..3 roles.
-- Con eso el roster quedó como una segunda tabla de personas en paralelo a `perfiles`, unidas
-- por `perfiles.persona_id` — dos identidades para el mismo ser humano, que hay que mantener
-- sincronizadas a mano y que ya divergen (el `nivel` del roster dice "administrador" mientras
-- `perfiles.roles` dice `{admin,jefe_zona}`).
--
-- Esta migración repunta las 9 FK de negocio de `personal_operativo(id)` a `perfiles(id)`,
-- usando `perfiles.persona_id` como puente, y elimina el roster.
--
-- Mapeo (verificado en producción antes de escribir esto — 0 filas huérfanas en las 9 columnas):
--   04cbdbcc-e6be-4256-923c-bd84927fc333  Frank Roldán       -> 16e9f3e4-... frank.roldan@carwashsm.com
--   5e8c1a2c-1ca4-418d-88ac-7adbb3b450b0  Julián Salinas     -> 4acaa3a9-... julian.salinas@carwashsm.com
--   aa768438-c71a-48e2-81d3-dc91a5558744  Laura Montealegre  -> e8ab57bd-... laura.montealegre@carwashsm.com
--
-- Es un repunte de referencias, no un borrado de filas: ninguna orden, turno, traspaso, conteo,
-- liquidación ni entrada de bitácora se toca. La comisión de jefe de patio vive en
-- `ordenes.comision_jefe_zona` y sigue intacta; solo cambia a qué tabla apunta el id de quién
-- respondía por ella. El texto original (`turnos_caja.responsable`,
-- `ordenes.jefe_zona_responsable`) tampoco se toca — sigue siendo la evidencia de lo que se
-- tecleó en su momento (regla 13).
--
-- Lo que se pierde y por qué no importa:
--   * `personal_operativo.nivel` -> redundante con `perfiles.roles` (los 3 son 'administrador',
--     y los 3 tienen 'admin' en roles). La regla "quién puede quedar a cargo de cuál caja" pasa
--     de NIVELES_POR_CAJA a un filtro directo por rol: candidato de la caja X = perfil activo
--     con X en `roles`. Una contratación futura entra con un solo rol y funciona igual.
--   * `personal_operativo.telefono` -> NULL en las 3 filas, nunca se usó.
--   * `personal_operativo_pin` -> creada en 0043, vacía y sin usar, reservada para una compuerta
--     de PIN que nunca se cableó (ver CLAUDE.md, "Autoridad del jefe de patio": el control quedó
--     siendo posterior — bitácora + responsable del turno — no previo). Si algún día se
--     construye, se recrea contra `perfiles`.
--
-- CONSECUENCIA NUEVA: `perfiles.id` referencia `auth.users(id) on delete cascade`. Al colgar el
-- histórico de `perfiles`, borrar un usuario desde el dashboard de Supabase intentaría cascadear
-- hasta acá. Por eso las FK nuevas van `on delete restrict`: ese borrado falla en seco en vez de
-- llevarse 330 órdenes, 52 turnos y la bitácora. Las cuentas se INACTIVAN
-- (`perfiles.activo = false`), nunca se borran — misma regla 5/13 de siempre.

-- ---------------------------------------------------------------------------------------------
-- 1. Validación: abortar antes de tocar nada si alguna referencia no mapea
-- ---------------------------------------------------------------------------------------------
-- Cada columna se da por buena si su valor resuelve a un perfil por el puente (`persona_id`) o
-- si YA es un id de perfil (repunte previo) — así la migración es reejecutable sin falsos
-- positivos. Cualquier otra cosa es una referencia que se perdería al dropear el roster.

do $$
declare
  faltantes text;
  n bigint;
begin
  create temp table _huerfanas(col text, cnt bigint) on commit drop;

  insert into _huerfanas
  select 'turnos_caja.responsable_persona_id', count(*) from public.turnos_caja t
    where t.responsable_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = t.responsable_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = t.responsable_persona_id)
  union all
  select 'turnos_caja.responsable_actual_persona_id', count(*) from public.turnos_caja t
    where t.responsable_actual_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = t.responsable_actual_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = t.responsable_actual_persona_id)
  union all
  select 'ordenes.jefe_zona_persona_id', count(*) from public.ordenes o
    where o.jefe_zona_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = o.jefe_zona_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = o.jefe_zona_persona_id)
  union all
  select 'traspasos_turno.de_persona_id', count(*) from public.traspasos_turno x
    where x.de_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = x.de_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = x.de_persona_id)
  union all
  select 'traspasos_turno.a_persona_id', count(*) from public.traspasos_turno x
    where x.a_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = x.a_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = x.a_persona_id)
  union all
  select 'liquidaciones_jefe_zona.persona_id', count(*) from public.liquidaciones_jefe_zona x
    where x.persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = x.persona_id)
      and not exists (select 1 from public.perfiles p where p.id = x.persona_id)
  union all
  select 'conteos_inventario.contado_por_persona_id', count(*) from public.conteos_inventario x
    where x.contado_por_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = x.contado_por_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = x.contado_por_persona_id)
  union all
  select 'conteos_inventario_lineas.responde_persona_id', count(*) from public.conteos_inventario_lineas x
    where x.responde_persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = x.responde_persona_id)
      and not exists (select 1 from public.perfiles p where p.id = x.responde_persona_id)
  union all
  select 'bitacora.persona_id', count(*) from public.bitacora x
    where x.persona_id is not null
      and not exists (select 1 from public.perfiles p where p.persona_id = x.persona_id)
      and not exists (select 1 from public.perfiles p where p.id = x.persona_id);

  select string_agg(col || ' (' || cnt || ')', ', ') into faltantes from _huerfanas where cnt > 0;
  if faltantes is not null then
    raise exception 'Abortado: hay referencias a personal_operativo que no resuelven a un perfil - %. Crea la cuenta de esas personas y enlazala con perfiles.persona_id antes de reintentar.', faltantes;
  end if;

  -- Toda persona del roster tiene que tener cuenta: si alguna quedó sin enlazar, la estaríamos
  -- borrando junto con su identidad aunque hoy no la referencie ninguna fila.
  select count(*) into n from public.personal_operativo po
    where not exists (select 1 from public.perfiles p where p.persona_id = po.id);
  if n > 0 then
    raise exception 'Abortado: % persona(s) del roster no tienen cuenta enlazada (perfiles.persona_id). Enlazalas antes de reintentar.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Soltar las FK viejas ANTES de repuntar
-- ---------------------------------------------------------------------------------------------
-- El repunte escribe ids de `perfiles` en columnas cuya FK todavía apunta a `personal_operativo`,
-- así que el constraint viejo tiene que salir primero o el UPDATE falla fila por fila. Entre este
-- bloque y el 4 las columnas quedan sin FK, pero todo corre dentro de la misma transacción: o
-- queda el estado final completo, o no queda nada.

alter table public.turnos_caja
  drop constraint turnos_caja_responsable_persona_id_fkey,
  drop constraint turnos_caja_responsable_actual_persona_id_fkey;
alter table public.ordenes
  drop constraint ordenes_jefe_zona_persona_id_fkey;
alter table public.traspasos_turno
  drop constraint traspasos_turno_de_persona_id_fkey,
  drop constraint traspasos_turno_a_persona_id_fkey;
alter table public.liquidaciones_jefe_zona
  drop constraint liquidaciones_jefe_zona_persona_id_fkey;
alter table public.conteos_inventario
  drop constraint conteos_inventario_contado_por_persona_id_fkey;
alter table public.conteos_inventario_lineas
  drop constraint conteos_inventario_lineas_responde_persona_id_fkey;
alter table public.bitacora
  drop constraint bitacora_persona_id_fkey;

-- ---------------------------------------------------------------------------------------------
-- 3. Repunte de los datos
-- ---------------------------------------------------------------------------------------------
-- El `where` por el puente hace cada UPDATE inofensivo sobre una fila ya repuntada: esa fila
-- guarda un id de perfil, que no coincide con ningún `persona_id`, y no se vuelve a tocar. (La
-- migración completa no es re-ejecutable después de aplicada — el paso 6 borra el puente — pero
-- sí es segura frente a un estado parcial dentro de una misma corrida.)
--
-- `turnos_caja` necesita que se le apaguen los triggers durante el repunte, por dos razones
-- distintas y las dos bloqueantes:
--
--   1. `turnos_caja_cerrado_inmutable` (0045, regla 14) rechaza CUALQUIER update sobre un turno
--      cerrado. La inmensa mayoría de los 52 turnos de producción lo están, así que sin esto la
--      migración aborta en la primera fila. La regla protege contra reescribir cifras de un
--      arqueo cerrado; acá no se toca ni una cifra — solo a qué tabla apunta el id de la persona,
--      que sigue siendo exactamente la misma persona.
--
--   2. `bitacora_turnos_update` vigila `responsable_actual_persona_id`, así que el repunte
--      escribiría 52 filas de bitácora con acción "editar" y sin usuario (la migración no corre
--      con sesión) — eventos que nunca ocurrieron, en la única tabla que es append-only y no se
--      puede limpiar después. El cambio de esquema queda registrado en el historial de
--      migraciones, que es donde corresponde; la bitácora es para actos de operación.
--
-- `ordenes` no necesita nada: `jefe_zona_persona_id` no está entre las columnas vigiladas por
-- `bitacora_ordenes_update`, y `ordenes_anulada_anula_ventas_pendientes` es `after update of
-- estado`. Las otras tablas del repunte no tienen triggers.

alter table public.turnos_caja disable trigger turnos_caja_cerrado_inmutable;
alter table public.turnos_caja disable trigger turnos_caja_cierre_requiere_conteo;
alter table public.turnos_caja disable trigger bitacora_turnos_update;

update public.turnos_caja t set responsable_persona_id = p.id
  from public.perfiles p where p.persona_id = t.responsable_persona_id;
update public.turnos_caja t set responsable_actual_persona_id = p.id
  from public.perfiles p where p.persona_id = t.responsable_actual_persona_id;
update public.ordenes o set jefe_zona_persona_id = p.id
  from public.perfiles p where p.persona_id = o.jefe_zona_persona_id;
update public.traspasos_turno x set de_persona_id = p.id
  from public.perfiles p where p.persona_id = x.de_persona_id;
update public.traspasos_turno x set a_persona_id = p.id
  from public.perfiles p where p.persona_id = x.a_persona_id;
update public.liquidaciones_jefe_zona x set persona_id = p.id
  from public.perfiles p where p.persona_id = x.persona_id;
update public.conteos_inventario x set contado_por_persona_id = p.id
  from public.perfiles p where p.persona_id = x.contado_por_persona_id;
update public.conteos_inventario_lineas x set responde_persona_id = p.id
  from public.perfiles p where p.persona_id = x.responde_persona_id;
update public.bitacora x set persona_id = p.id
  from public.perfiles p where p.persona_id = x.persona_id;

alter table public.turnos_caja enable trigger turnos_caja_cerrado_inmutable;
alter table public.turnos_caja enable trigger turnos_caja_cierre_requiere_conteo;
alter table public.turnos_caja enable trigger bitacora_turnos_update;

-- ---------------------------------------------------------------------------------------------
-- 4. Las FK ahora apuntan a `perfiles`
-- ---------------------------------------------------------------------------------------------

alter table public.turnos_caja
  add constraint turnos_caja_responsable_persona_id_fkey
    foreign key (responsable_persona_id) references public.perfiles(id) on delete restrict,
  add constraint turnos_caja_responsable_actual_persona_id_fkey
    foreign key (responsable_actual_persona_id) references public.perfiles(id) on delete restrict;

alter table public.ordenes
  add constraint ordenes_jefe_zona_persona_id_fkey
    foreign key (jefe_zona_persona_id) references public.perfiles(id) on delete restrict;

alter table public.traspasos_turno
  add constraint traspasos_turno_de_persona_id_fkey
    foreign key (de_persona_id) references public.perfiles(id) on delete restrict,
  add constraint traspasos_turno_a_persona_id_fkey
    foreign key (a_persona_id) references public.perfiles(id) on delete restrict;

alter table public.liquidaciones_jefe_zona
  add constraint liquidaciones_jefe_zona_persona_id_fkey
    foreign key (persona_id) references public.perfiles(id) on delete restrict;

alter table public.conteos_inventario
  add constraint conteos_inventario_contado_por_persona_id_fkey
    foreign key (contado_por_persona_id) references public.perfiles(id) on delete restrict;

alter table public.conteos_inventario_lineas
  add constraint conteos_inventario_lineas_responde_persona_id_fkey
    foreign key (responde_persona_id) references public.perfiles(id) on delete restrict;

alter table public.bitacora
  add constraint bitacora_persona_id_fkey
    foreign key (persona_id) references public.perfiles(id) on delete restrict;

-- ---------------------------------------------------------------------------------------------
-- 5. `interno.actor()` -- la persona es la cuenta
-- ---------------------------------------------------------------------------------------------
-- 0044 resolvía la persona buscando el responsable del turno abierto, porque la cuenta era
-- compartida y no decía quién era. Con cuentas individuales `auth.uid()` YA es la persona, y es
-- más preciso: registra a quien realmente ejecutó la escritura, no a quien estaba a cargo del
-- turno (que puede ser otro).
--
-- Desde acá `persona_id` == `usuario_id` en cada fila nueva. Las dos columnas se conservan igual:
-- en las filas históricas SI difieren (cuenta compartida + persona resuelta por turno) y esa
-- distinción es justo lo que no se puede perder. `persona_id` queda nulo si la escritura viene
-- de una cuenta sin perfil (no debería pasar) o de un contexto sin sesión.

create or replace function interno.actor()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'usuario_id',     p.id,
    'usuario_nombre', p.nombre,
    'usuario_rol',    p.rol_activo,
    'persona_id',     p.id,
    'persona_nombre', p.nombre
  )
  from public.perfiles p
  where p.id = auth.uid();
$function$;

-- Resolvía las 13 grafías de texto libre contra el roster durante el backfill de 0043. Sin
-- roster no tiene a qué resolver, y ese backfill ya corrió hace tiempo.
drop function if exists interno.persona_por_texto(text);

-- ---------------------------------------------------------------------------------------------
-- 6. Adiós al roster
-- ---------------------------------------------------------------------------------------------
-- `perfiles.persona_id` era el puente y ya cumplió: sin él, la identidad de la persona es el id
-- de su propia fila.

alter table public.perfiles drop column persona_id;

drop table public.personal_operativo_pin;
drop table public.personal_operativo;   -- se lleva sus 3 policies (0043) con ella
