-- Desactiva temporalmente el arqueo ciego de inventario (0048) hasta que se haga una auditoría a
-- fondo del proceso (decisión de Alessandro, 2026-09-15). No se borra nada: se deshabilita el
-- trigger que bloqueaba el cierre de turno sin conteo de cierre, para poder revertir con
-- `alter table turnos_caja enable trigger turnos_caja_cierre_requiere_conteo;` cuando se reactive.
-- Las tablas `conteos_inventario`/`conteos_inventario_lineas` y las RPCs
-- (`abrir_conteo_inventario`/`cerrar_conteo_inventario`/`preview_conteo_inventario`) quedan intactas.
-- El frontend de /jefe-zona/caja ya no muestra el paso de "Contar inventario" (ver CLAUDE.md).

alter table public.turnos_caja disable trigger turnos_caja_cierre_requiere_conteo;
