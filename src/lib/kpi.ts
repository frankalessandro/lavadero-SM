// Helper de comparación para las tarjetas de cifra grande (`KpiCard`). Vive acá y no dentro del
// componente por `react-refresh/only-export-components`, que solo está desactivado en
// `src/routes/**` (mismo motivo que `src/lib/pagoLineas.ts`).

export interface DeltaKpi {
  texto: string
  tono: 'verde' | 'rojo' | 'neutro'
  direccion: 'sube' | 'baja' | 'igual'
}

/**
 * Compara `actual` contra `previo` y devuelve el chip ▲▼ ya redactado.
 *
 * `sentido` decide de qué color se pinta: en ingresos o utilidad subir es bueno (`mayor-mejor`);
 * en egresos o gastos subir es malo (`menor-mejor`). Devuelve `null` cuando no hay nada que
 * comparar (ambos en cero), para que la tarjeta muestre el texto de "sin comparación".
 */
export function calcularDelta(
  actual: number,
  previo: number,
  sentido: 'mayor-mejor' | 'menor-mejor',
  fmt: (n: number) => string,
  sufijo = 'vs. anterior',
): DeltaKpi | null {
  if (previo === 0 && actual === 0) return null
  const diff = actual - previo
  if (diff === 0) return { texto: `igual que ${sufijo.replace(/^vs\.\s*/, '')}`, tono: 'neutro', direccion: 'igual' }
  const subio = diff > 0
  const bueno = sentido === 'mayor-mejor' ? subio : !subio
  const pct = previo !== 0 ? Math.abs(diff / previo) * 100 : null
  return {
    texto: `${subio ? '+' : '−'}${fmt(Math.abs(diff))}${pct !== null ? ` (${pct.toFixed(0)}%)` : ''} ${sufijo}`,
    tono: bueno ? 'verde' : 'rojo',
    direccion: subio ? 'sube' : 'baja',
  }
}
