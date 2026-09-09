// Helper del filtro por columna (`src/components/layout/TableHeadFilter.tsx`) — separado en
// `lib/` porque `react-refresh/only-export-components` solo permite exportar componentes desde
// un archivo de componentes (mismo motivo que `src/lib/pagoLineas.ts`/`src/lib/kpi.ts`).

// Substring case-insensitive, sin normalizar tildes — a propósito simple (mismo criterio que la
// búsqueda por placa de jefe-zona: coincidencia parcial).
export function coincide(valor: string | null | undefined, termino: string): boolean {
  const t = termino.trim().toLowerCase()
  if (!t) return true
  return (valor ?? '').toLowerCase().includes(t)
}
