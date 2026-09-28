-- El advisor de seguridad de Supabase marcó `interno.fuera_de_ventana_salida` (0075) con
-- search_path mutable. La función solo usa funciones de pg_catalog (date_trunc, intervalos, zona
-- horaria), que se resuelven igual con search_path vacío.
alter function interno.fuera_de_ventana_salida(text, timestamptz, timestamptz) set search_path = '';
