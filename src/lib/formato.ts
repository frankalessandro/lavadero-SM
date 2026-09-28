export const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const COMPACTO = new Intl.NumberFormat('es-CO', { notation: 'compact', maximumFractionDigits: 1 })

/** "$1,2 M" / "$850 mil" — para ejes de gráficas y cifras secundarias donde el peso exacto sobra. */
export function copCompacto(n: number): string {
  return `${n < 0 ? '−' : ''}$${COMPACTO.format(Math.abs(n))}`
}

export const pct = (n: number) => `${n.toFixed(1)}%`
