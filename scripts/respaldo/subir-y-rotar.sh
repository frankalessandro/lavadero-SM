#!/usr/bin/env bash
# Sube un respaldo cifrado a Google Drive con rclone y aplica la retención del Plan de Alcance:
# 7 diarios, 4 semanales (domingos) y 12 mensuales (día 1), hora Colombia.
#
#   Uso: subir-y-rotar.sh <ruta/al/lavadero-sm_*.tar.gz.gpg>
#
#   Variables:
#     RCLONE_DRIVE_TOKEN       JSON que entrega `rclone authorize "drive"` (ver docs/respaldos.md)
#     RESPALDO_DRIVE_CARPETA   carpeta en Drive (default "Respaldos Lavadero SM")
#     RESPALDO_FORZAR          "1" para subir aunque sea mucho más pequeño que el anterior
#
# Carpetas en Drive: <carpeta>/diario, <carpeta>/semanal, <carpeta>/mensual.
set -euo pipefail

: "${RCLONE_DRIVE_TOKEN:?Falta RCLONE_DRIVE_TOKEN}"
archivo="${1:?Uso: subir-y-rotar.sh <archivo.tar.gz.gpg>}"
[ -s "$archivo" ] || { echo "::error::No existe el respaldo $archivo" >&2; exit 1; }
CARPETA="${RESPALDO_DRIVE_CARPETA:-Respaldos Lavadero SM}"
MANTENER_DIARIO=7
MANTENER_SEMANAL=4
MANTENER_MENSUAL=12

# rclone se configura solo por variables de entorno: nada queda escrito en disco.
export RCLONE_CONFIG_DRIVE_TYPE=drive
export RCLONE_CONFIG_DRIVE_SCOPE=drive
export RCLONE_CONFIG_DRIVE_TOKEN="$RCLONE_DRIVE_TOKEN"
remoto="drive:$CARPETA"

fallar() { echo "::error::$*" >&2; exit 1; }

base="$(basename "$archivo")"
prefijo="${base%.tar.gz.gpg}"
sha="$(dirname "$archivo")/$prefijo.sha256"
bytes="$(stat -c %s "$archivo")"

# "Anormalmente pequeño" relativo: si pesa menos de la mitad del último diario, algo se perdió
# en el camino (tabla vaciada, conexión cortada) — mejor fallar que rotar y borrar uno bueno.
previo="$(rclone lsjson "$remoto/diario" --files-only --include 'lavadero-sm_*.tar.gz.gpg' 2>/dev/null \
  | jq -r 'sort_by(.Name) | last | .Size // 0' || echo 0)"
if [ "${RESPALDO_FORZAR:-0}" != "1" ] && [ "${previo:-0}" -gt 0 ] && [ $((bytes * 2)) -lt "$previo" ]; then
  fallar "el respaldo ($bytes bytes) pesa menos de la mitad del anterior ($previo bytes). Revisa la base; para subirlo igual, ejecútalo a mano con 'forzar'."
fi

echo "→ Subiendo a Drive: $CARPETA/diario/$base"
rclone copyto "$archivo" "$remoto/diario/$base"
[ -f "$sha" ] && rclone copyto "$sha" "$remoto/diario/$prefijo.sha256"

# Verificar que lo que quedó en Drive es idéntico a lo local (Drive calcula md5 del lado servidor).
local_md5="$(md5sum "$archivo" | cut -d' ' -f1)"
remoto_md5="$(rclone md5sum "$remoto/diario/$base" | cut -d' ' -f1)"
[ "$local_md5" = "$remoto_md5" ] || fallar "el archivo en Drive no coincide con el local (md5 distinto)"

dia_semana="$(TZ=America/Bogota date +%u)"
dia_mes="$(TZ=America/Bogota date +%d)"
copiar_a() {
  echo "→ Copia $1: $CARPETA/$1/$base"
  rclone copyto "$remoto/diario/$base" "$remoto/$1/$base"
  rclone copyto "$remoto/diario/$prefijo.sha256" "$remoto/$1/$prefijo.sha256" 2>/dev/null || true
}
[ "$dia_semana" = "7" ] && copiar_a semanal
[ "$dia_mes" = "01" ] && copiar_a mensual

# Retención: los nombres llevan fecha AAAA-MM-DD_HHMM, así que el orden alfabético es el
# cronológico. Se borra de más antiguo a más nuevo lo que exceda el límite (van a la papelera de
# Drive, que se vacía sola a los 30 días — margen ante un error de este mismo script).
podar() {
  local carpeta="$1" mantener="$2"
  rclone lsf "$remoto/$carpeta" --files-only --include 'lavadero-sm_*.tar.gz.gpg' 2>/dev/null \
    | sort | head -n "-$mantener" | while read -r viejo; do
        [ -n "$viejo" ] || continue
        echo "  – elimina $carpeta/$viejo"
        rclone deletefile "$remoto/$carpeta/$viejo"
        rclone deletefile "$remoto/$carpeta/${viejo%.tar.gz.gpg}.sha256" 2>/dev/null || true
      done
}
echo "→ Retención: $MANTENER_DIARIO diarios, $MANTENER_SEMANAL semanales, $MANTENER_MENSUAL mensuales"
podar diario "$MANTENER_DIARIO"
podar semanal "$MANTENER_SEMANAL"
podar mensual "$MANTENER_MENSUAL"

echo "✓ Respaldo en Drive verificado ($bytes bytes)"
