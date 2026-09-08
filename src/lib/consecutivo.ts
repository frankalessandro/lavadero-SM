// Detección de huecos en el consecutivo de tiquetes (control antifraude del Plan: "consecutivo
// continuo de tiquetes con alerta ante huecos").
//
// `ordenes.consecutivo` es `generated always as identity`: Postgres lo asigna al insertar y
// QUEMA el número si el insert se revierte (violación de constraint, rollback). Una orden
// anulada NO crea hueco — conserva su consecutivo y sigue visible. Un hueco = un número que
// nunca llegó a existir, y ese es el patrón clásico para sacar plata sin dejar tiquete.
//
// Entre dos consecutivos presentes cualquier número faltante es un hueco real: el consecutivo es
// monótono por orden de inserción, así que si #250 y #255 existen, #251–254 se insertaron entre
// medias y deberían estar (anuladas incluidas). Si no están, nunca se confirmaron.
export function huecosEntre(consecutivos: number[]): number[] {
  if (consecutivos.length < 2) return []
  const presentes = new Set(consecutivos)
  const min = Math.min(...consecutivos)
  const max = Math.max(...consecutivos)
  const huecos: number[] = []
  for (let n = min + 1; n < max; n++) {
    if (!presentes.has(n)) huecos.push(n)
  }
  return huecos
}

// Agrupa una lista de faltantes en tramos contiguos para mostrarlos compactos:
// [3, 4, 5, 9, 12, 13] → "#3–5, #9, #12–13".
export function formatearHuecos(huecos: number[]): string {
  if (huecos.length === 0) return ''
  const orden = [...huecos].sort((a, b) => a - b)
  const tramos: string[] = []
  let inicio = orden[0]
  let previo = orden[0]
  for (let i = 1; i <= orden.length; i++) {
    const actual = orden[i]
    if (actual === previo + 1) {
      previo = actual
      continue
    }
    tramos.push(inicio === previo ? `#${inicio}` : `#${inicio}–${previo}`)
    inicio = actual
    previo = actual
  }
  return tramos.join(', ')
}
