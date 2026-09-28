#!/usr/bin/env bash
# Restaura un respaldo cifrado en una base Postgres de Supabase y verifica que quedó completo.
# Sirve para la prueba mensual automática y para una recuperación real (proyecto Supabase nuevo).
#
#   Uso: restaurar.sh <lavadero-sm_*.tar.gz.gpg>
#
#   Variables:
#     RESPALDO_CLAVE   la misma frase con que se cifró
#     DESTINO_DB_URL   base destino — debe ser un proyecto Supabase (o `supabase start` local),
#                      NUNCA la base de producción: se crean tablas y se cargan datos encima.
#     PG_IMAGE         imagen de Postgres para psql (default postgres:17)
#
# El destino debe estar vacío (proyecto recién creado): la estructura se crea desde cero.
set -euo pipefail

: "${RESPALDO_CLAVE:?Falta RESPALDO_CLAVE}"
: "${DESTINO_DB_URL:?Falta DESTINO_DB_URL}"
archivo="${1:?Uso: restaurar.sh <archivo.tar.gz.gpg>}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"

fallar() { echo "::error::$*" >&2; exit 1; }

case "$DESTINO_DB_URL" in
  *uuxdzgxzvthlwinnrzzh*) fallar "DESTINO_DB_URL apunta a la base de PRODUCCIÓN. Restaura en un proyecto nuevo." ;;
esac

trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT

echo "→ Descifrando"
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$archivo" 3<<<"$RESPALDO_CLAVE" \
  | tar -xz -C "$trabajo" || fallar "no se pudo descifrar/descomprimir (¿clave equivocada?)"
dir="$(find "$trabajo" -mindepth 1 -maxdepth 1 -type d | head -n1)"
[ -f "$dir/estructura.sql" ] || fallar "el archivo no tiene el formato esperado"

# `public` ya existe en cualquier base; el dump puede traer su CREATE SCHEMA.
sed -i -E 's/^CREATE SCHEMA (public|interno);/CREATE SCHEMA IF NOT EXISTS \1;/' "$dir/estructura.sql"
# Los privilegios por defecto de los roles internos de Supabase (supabase_admin, etc.) ya vienen
# configurados en cualquier proyecto nuevo, y `postgres` no tiene permiso para redefinirlos.
sed -i -E '/^ALTER DEFAULT PRIVILEGES FOR ROLE /d' "$dir/estructura.sql"

psql_dest() {
  docker run --rm --network host -e DB_URL="$DESTINO_DB_URL" -e PGCONNECT_TIMEOUT=30 \
    -v "$dir:/respaldo" -w /respaldo "$PG_IMAGE" sh -c "$1"
}

echo "→ Estructura"
psql_dest 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f estructura.sql'

# Datos con los triggers apagados (session_replication_role = replica): no se disparan la
# bitácora ni las validaciones de negocio, y el orden de las llaves foráneas no importa. Todo en
# una sola transacción — o entra completo, o no entra nada.
echo "→ Usuarios y datos"
psql_dest 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET session_replication_role = replica" -f usuarios.sql -f datos.sql'

# El historial de migraciones es metadato: solo se carga si el destino tiene la tabla.
echo "select to_regclass('supabase_migrations.schema_migrations') is not null;" > "$dir/hay_migraciones.sql"
if psql_dest 'psql "$DB_URL" -X -At -f hay_migraciones.sql' | grep -q '^t$'; then
  echo "→ Historial de migraciones"
  psql_dest 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "truncate supabase_migrations.schema_migrations" -f migraciones.sql'
else
  echo "  (el destino no tiene supabase_migrations.schema_migrations — se omite)"
fi
if [ -s "$dir/triggers_auth.sql" ]; then
  echo "→ Triggers propios sobre auth"
  psql_dest 'psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f triggers_auth.sql'
fi
psql_dest 'psql "$DB_URL" -X -q -c "ANALYZE"'

# ── Verificación: cada tabla con exactamente las filas que dice el respaldo ──────────────────
# Lo que se imprime es solo el resultado (coinciden / no coinciden), no los conteos: los logs de
# este repo son públicos.
echo "→ Verificando conteos"
awk -F, -v q="'" '{ print "select " q $1 q ", count(*) from " $1 " union all" }' "$dir/conteos.csv" \
  | sed '$ s/ union all$/;/' > "$dir/verificar.sql"
psql_dest 'psql "$DB_URL" -X -At -F, -f verificar.sql' | sort > "$dir/restaurado.csv"

if diff -q "$dir/conteos.csv" "$dir/restaurado.csv" > /dev/null; then
  echo "✓ Restauración verificada: $(wc -l < "$dir/conteos.csv" | tr -d ' ') tablas con los mismos conteos que el respaldo"
else
  distintas="$(diff "$dir/conteos.csv" "$dir/restaurado.csv" | grep -c '^<' || true)"
  fallar "$distintas tabla(s) no quedaron con los mismos conteos que el respaldo"
fi
