-- Cuentas individuales de los 3 administradores (prerrequisito de la migración roster→cuentas).
--
-- Hasta acá solo existían las 3 cuentas compartidas por rol (gerencia@ / jefepatio@ / vigilante@).
-- 0053 pasó el modelo a "una cuenta por persona"; esta migración crea las 3 cuentas reales y las
-- enlaza a su fila de `personal_operativo` (0043) por `persona_id`. Ese enlace es el puente que
-- usará la migración siguiente para repuntar las FK de turnos/órdenes/liquidaciones/bitácora del
-- roster a `perfiles` y así poder eliminar `personal_operativo`.
--
-- Los 3 son `administrador` (0047) y han operado como jefe de patio (abrieron caja, tienen
-- comisión) — esta migración no toca nada de eso, solo agrega las cuentas.
--
-- Contraseñas desechables (se cambian obligatoriamente al primer ingreso, debe_cambiar_password):
--   frank.roldan@carwashsm.com       Sm-Frank-2h9k
--   julian.salinas@carwashsm.com     Sm-Julian-4p7m
--   laura.montealegre@carwashsm.com  Sm-Laura-8t3n
--
-- Se resuelve todo por email (nunca por id generado). Idempotente: si la cuenta ya existe, no la
-- duplica (el `on conflict (email)` de auth.users la salta y el update de perfiles la re-asienta).

do $$
declare
  r record;
  v_id uuid;
  v_n int;
  cuentas jsonb := jsonb_build_array(
    jsonb_build_object('email','frank.roldan@carwashsm.com','nombre','Frank Roldán',
      'pass','Sm-Frank-2h9k','persona','04cbdbcc-e6be-4256-923c-bd84927fc333'),
    jsonb_build_object('email','julian.salinas@carwashsm.com','nombre','Julián Salinas',
      'pass','Sm-Julian-4p7m','persona','5e8c1a2c-1ca4-418d-88ac-7adbb3b450b0'),
    jsonb_build_object('email','laura.montealegre@carwashsm.com','nombre','Laura Montealegre',
      'pass','Sm-Laura-8t3n','persona','aa768438-c71a-48e2-81d3-dc91a5558744')
  );
begin
  for r in select * from jsonb_to_recordset(cuentas)
      as x(email text, nombre text, pass text, persona uuid)
  loop
    select id into v_id from auth.users where email = r.email;

    if v_id is null then
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
        r.email, extensions.crypt(r.pass, extensions.gen_salt('bf')),
        now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('nombre', r.nombre))
      returning id into v_id;

      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
        jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now());
    end if;

    -- el trigger on_auth_user_created ya creó perfiles(id, nombre); asentar rol/persona/estado
    update public.perfiles set
      roles = array['admin']::text[], rol_activo = 'admin', activo = true,
      debe_cambiar_password = true, nombre = r.nombre, persona_id = r.persona
    where id = v_id;
  end loop;

  select count(*) into v_n from public.perfiles p
   join auth.users u on u.id = p.id
  where u.email in ('frank.roldan@carwashsm.com','julian.salinas@carwashsm.com','laura.montealegre@carwashsm.com')
    and p.roles = array['admin']::text[] and p.rol_activo = 'admin' and p.activo
    and p.debe_cambiar_password and p.persona_id is not null;
  if v_n <> 3 then
    raise exception 'Verificación falló: perfiles OK esperados 3, hay %', v_n;
  end if;
end $$;
