-- Julián Salinas es administrador, no jefe de patio.
--
-- 0043 lo sembró como `jefe_patio` por lo que se sabía en ese momento. Alessandro aclaró después
-- que los tres (Frank, Laura, Julián) son administradores — hoy no hay ningún jefe de patio de
-- nivel operativo puro. El nivel `jefe_patio` se conserva en el CHECK de la tabla a propósito,
-- para cuando entre alguien así (ver CLAUDE.md §Personal operativo).
--
-- Data fix, no cambio de esquema. Va como migración numerada —y no como UPDATE manual— para que
-- un rebuild desde cero (`docker compose down -v` + reaplicar) y el Supabase real terminen en el
-- mismo estado. Idempotente: si ya está en `administrador` no hace nada.

update public.personal_operativo
set nivel = 'administrador'
where nombre = 'Julián Salinas' and nivel = 'jefe_patio';
