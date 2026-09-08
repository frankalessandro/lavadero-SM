-- Cruce lavado ↔ parqueadero (regla de negocio 8).
--
-- "Vehículos lavados no generan cobro combinado con parqueadero (se retiran al terminar el
-- servicio, ~1h promedio)". Hoy nada vincula `ordenes` con `estancias_parqueadero`: si un carro
-- se lavó a las 4pm y sigue ahí a las 8pm, el vigilante registra una estancia nueva y le cobra
-- los $8.000 de noche, sin forma de saber que ese vehículo ya pasó por el lavadero.
--
-- El vigilante NO tiene acceso de lectura a `ordenes` (RLS: solo jefe_zona/admin). Esta RPC
-- `security definer` le devuelve lo mínimo para el aviso — consecutivo, estado y horas — sin
-- exponer precio, cliente ni comisión. NO cambia el cobro: si el carro efectivamente se quedó
-- toda la noche, qué se hace es criterio del vigilante/negocio; acá solo se hace visible el cruce
-- para que la regla 8 se pueda cumplir en vez de pasar por alto.
--
-- Se recibe `p_desde` (inicio del día en hora local del cliente) en vez de calcular el día en el
-- servidor: Supabase corre en UTC y un lavado de las 8pm en Bogotá cae en el día UTC siguiente.
-- Mismo criterio que el resto del código (`inicioDeHoyISO()` se calcula en el cliente).

create function public.lavado_hoy_por_placa(p_placa text, p_desde timestamptz)
returns table (
  consecutivo integer,
  estado text,
  creado_en timestamptz,
  entregada_en timestamptz
)
language sql stable security definer set search_path = public
as $$
  select o.consecutivo, o.estado, o.creado_en, o.entregada_en
  from public.ordenes o
  where o.placa = upper(trim(p_placa))
    and o.estado <> 'anulada'
    and o.creado_en >= p_desde
  order by o.consecutivo desc
  limit 1;
$$;

revoke execute on function public.lavado_hoy_por_placa(text, timestamptz) from public, anon;
grant execute on function public.lavado_hoy_por_placa(text, timestamptz) to authenticated;

-- Nota de advisor: WARN "Signed-In Users Can Execute SECURITY DEFINER Function" — intencional.
-- Es una lectura acotada (una fila, cuatro columnas no sensibles) que el vigilante necesita y no
-- puede hacer por RLS; sin `security definer` no hay forma de dársela sin abrirle `ordenes` entera.
