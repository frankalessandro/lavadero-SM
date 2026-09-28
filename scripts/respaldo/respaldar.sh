#!/usr/bin/env bash
# Saca un respaldo completo de la base de Supabase con pg_dump (sin usar los backups pagos de
# Supabase), lo valida, lo comprime y lo cifra.
#
#   Uso: respaldar.sh <directorio_de_salida>
#
#   Variables:
#     SUPABASE_DB_URL     cadena "Session pooler" de Supabase (postgresql://postgres.<ref>:<clave>@...:5432/postgres)
#     RESPALDO_CLAVE      frase con la que se cifra el archivo (sin ella no se puede restaurar)
#     RESPALDO_MIN_BYTES  tamaño mínimo aceptable del archivo final (default 50000)
#     PG_IMAGE            imagen de Postgres para pg_dump (default postgres:17 — misma versión mayor que Supabase)
#
# Deja en <salida>: lavadero-sm_<fecha>.tar.gz.gpg y su .sha256. El nombre del archivo queda en
# la variable `archivo` de $GITHUB_OUTPUT cuando corre en GitHub Actions.
#
# El repo es público: los logs de Actions los ve cualquiera. Por eso este script NO imprime
# datos del negocio (ni conteos por tabla) — solo tamaños y resultado de las validaciones. El
# detalle va dentro del archivo cifrado (conteos.csv).
set -euo pipefail

: "${SUPABASE_DB_URL:?Falta SUPABASE_DB_URL}"
: "${RESPALDO_CLAVE:?Falta RESPALDO_CLAVE}"
salida="${1:?Uso: respaldar.sh <directorio_de_salida>}"
MIN_BYTES="${RESPALDO_MIN_BYTES:-50000}"
PG_IMAGE="${PG_IMAGE:-postgres:17}"

sello="$(TZ=America/Bogota date +%Y-%m-%d_%H%M)"
nombre="lavadero-sm_${sello}"
trabajo="$(mktemp -d)"
trap 'rm -rf "$trabajo"' EXIT
dir="$trabajo/$nombre"
mkdir -p "$dir" "$salida"

fallar() { echo "::error::$*" >&2; exit 1; }

# pg_dump/psql dentro de un contenedor: versión exacta sin instalar paquetes. La URL viaja por
# variable de entorno (no como argumento) para que no aparezca en la lista de procesos.
pg() {
  docker run --rm --network host -e DB_URL="$SUPABASE_DB_URL" -e PGCONNECT_TIMEOUT=30 \
    -v "$dir:/respaldo" -w /respaldo "$PG_IMAGE" sh -c "$1"
}

echo "→ Estructura (esquemas public e interno)"
pg 'pg_dump "$DB_URL" --schema-only --schema=public --schema=interno --no-owner --file=estructura.sql'

echo "→ Datos del negocio"
pg 'pg_dump "$DB_URL" --data-only --schema=public --schema=interno --no-owner --file=datos.sql'

# Las cuentas de login viven en auth.users / auth.identities (esquema administrado por Supabase):
# se respaldan solo sus DATOS, la estructura ya existe en cualquier proyecto Supabase destino.
echo "→ Usuarios de login"
pg 'pg_dump "$DB_URL" --data-only --table=auth.users --table=auth.identities --no-owner --file=usuarios.sql'

# Historial de migraciones aplicadas, para que `supabase db push` siga funcionando tras restaurar.
echo "→ Historial de migraciones"
pg 'pg_dump "$DB_URL" --data-only --table=supabase_migrations.schema_migrations --no-owner --file=migraciones.sql'

# Triggers PROPIOS sobre tablas de auth (ej. on_auth_user_created, que crea el perfil al dar de
# alta una cuenta — 0011). Viven en la tabla auth.users, así que el dump de `public` no los trae
# aunque sí trae su función; sin esto, un proyecto restaurado dejaría de crear perfiles.
cat > "$dir/consulta_triggers.sql" <<'SQL'
select 'DROP TRIGGER IF EXISTS ' || quote_ident(t.tgname) || ' ON ' || n.nspname || '.' || quote_ident(c.relname)
       || ';' || chr(10) || pg_get_triggerdef(t.oid) || ';'
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
join pg_namespace pn on pn.oid = p.pronamespace
where not t.tgisinternal and n.nspname = 'auth' and pn.nspname in ('public', 'interno')
order by t.tgname;
SQL
echo "→ Triggers propios sobre auth"
{
  echo 'SET search_path = public, interno;'
  pg 'psql "$DB_URL" -X -At -f consulta_triggers.sql'
} > "$dir/triggers_auth.sql"
rm -f "$dir/consulta_triggers.sql"
grep -q 'CREATE TRIGGER' "$dir/triggers_auth.sql" \
  || echo "::warning::No se encontraron triggers propios sobre auth (se esperaba on_auth_user_created)"

# Conteo de filas SACADO DEL MISMO DUMP (no de una consulta aparte): el parqueadero opera de
# noche, y una consulta separada podría ver filas que el dump no vio. Así el conteo es exacto y
# la prueba de restauración compara contra lo que realmente quedó guardado.
awk '
  /^COPY / { tabla = $2; n = 0; dentro = 1; next }
  dentro && /^\\\.$/ { print tabla "," n; dentro = 0; next }
  dentro { n++ }
' "$dir/datos.sql" "$dir/usuarios.sql" "$dir/migraciones.sql" | sort > "$dir/conteos.csv"

# ── Validaciones: si algo no cuadra, el respaldo falla y NO se sube ──────────────────────────
for f in estructura.sql datos.sql usuarios.sql; do
  [ -s "$dir/$f" ] || fallar "$f quedó vacío"
done
grep -q '^CREATE TABLE public.ordenes ' "$dir/estructura.sql" || fallar "la estructura no trae la tabla ordenes"
grep -q '^CREATE POLICY ' "$dir/estructura.sql" || fallar "la estructura no trae políticas RLS"

filas() { awk -F, -v t="$1" '$1 == t { print $2 }' "$dir/conteos.csv"; }
for t in public.ordenes public.pagos public.turnos_caja public.perfiles public.lavadores auth.users; do
  n="$(filas "$t")"
  [ -n "$n" ] || fallar "el respaldo no trae la tabla $t"
  [ "$n" -gt 0 ] || fallar "la tabla $t salió vacía en el respaldo"
done
tablas="$(wc -l < "$dir/conteos.csv" | tr -d ' ')"

cat > "$dir/LEEME.txt" <<EOF
Respaldo Lavadero SM — $sello (hora Colombia)
Generado con pg_dump ($PG_IMAGE). Restaurar con scripts/respaldo/restaurar.sh
(ver docs/respaldos.md). Orden: estructura.sql → usuarios.sql → datos.sql → migraciones.sql
→ triggers_auth.sql. Las Edge Functions (supabase/functions) se vuelven a desplegar desde el repo.
conteos.csv = filas por tabla, tomadas del propio dump.
EOF

# ── Empaquetar, verificar y cifrar ───────────────────────────────────────────────────────────
tar -czf "$trabajo/$nombre.tar.gz" -C "$trabajo" "$nombre"
gzip -t "$trabajo/$nombre.tar.gz" || fallar "el comprimido está corrupto"

gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "$salida/$nombre.tar.gz.gpg" \
  "$trabajo/$nombre.tar.gz" 3<<<"$RESPALDO_CLAVE"

# Comprobar que el cifrado se puede abrir con la misma clave antes de darlo por bueno.
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt \
  "$salida/$nombre.tar.gz.gpg" 3<<<"$RESPALDO_CLAVE" | gzip -t \
  || fallar "el archivo cifrado no se pudo abrir con la clave"

bytes="$(stat -c %s "$salida/$nombre.tar.gz.gpg")"
[ "$bytes" -ge "$MIN_BYTES" ] || fallar "respaldo anormalmente pequeño: $bytes bytes (mínimo $MIN_BYTES)"

(cd "$salida" && sha256sum "$nombre.tar.gz.gpg" > "$nombre.sha256")

echo "✓ Respaldo $nombre.tar.gz.gpg — $bytes bytes, $tablas tablas validadas"
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "archivo=$nombre.tar.gz.gpg" >> "$GITHUB_OUTPUT"
fi
