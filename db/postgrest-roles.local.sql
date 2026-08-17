-- Bootstrap de roles para el PostgREST suelto de desarrollo local — NO es parte del
-- esquema portable a Supabase (allá los roles anon/authenticated ya los gestiona GoTrue).
--
-- Sin Auth todavía: web_anon tiene CRUD completo sobre public. Esto es aceptable solo
-- porque Postgres corre en localhost, sin exponerse — el candado real por rol (RLS) llega
-- cuando este proyecto se conecte a Supabase de verdad.

create role web_anon nologin;
grant usage on schema public to web_anon;
grant select, insert, update on all tables in schema public to web_anon;
grant usage on all sequences in schema public to web_anon;

create role authenticator noinherit login password 'REPLACE_ME';
grant web_anon to authenticator;

-- Para que las tablas creadas en migraciones futuras no necesiten un GRANT manual aparte.
alter default privileges in schema public grant select, insert, update on tables to web_anon;
alter default privileges in schema public grant usage on sequences to web_anon;
