-- Corrige `saldos_deuda_personal` (0089): Postgres no acepta FULL JOIN con `is not distinct from`
-- ("FULL JOIN is only supported with merge-joinable or hash-joinable join conditions"). Mismo
-- resultado juntando ledger y cuentas abiertas con UNION ALL y agrupando por deudor.
create or replace function public.saldos_deuda_personal()
returns table (lavador_id uuid, persona_id uuid, prestamo integer, tienda integer, tienda_en_cuenta integer)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not interno.es_activo() or interno.rol_actual() not in ('jefe_zona', 'admin') then
    raise exception 'No autorizado para ver deudas del personal';
  end if;

  return query
  with movimientos as (
    select d.lavador_id, d.persona_id,
      case when d.bolsa = 'prestamo' then d.monto else 0 end as prestamo,
      case when d.bolsa = 'tienda' then d.monto else 0 end as tienda,
      0 as en_cuenta
    from deudas_personal d where d.estado = 'activo'
    union all
    select c.lavador_id, c.persona_id, 0, v.total, v.total
    from cuentas c join ventas v on v.cuenta_id = c.id and v.estado = 'pendiente'
    where c.estado = 'abierta' and (c.lavador_id is not null or c.persona_id is not null)
  )
  select m.lavador_id, m.persona_id,
    sum(m.prestamo)::integer, sum(m.tienda)::integer, sum(m.en_cuenta)::integer
  from movimientos m
  group by m.lavador_id, m.persona_id;
end;
$$;
