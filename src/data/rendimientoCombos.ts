import { fetchOrdenesEntregadasEnRango } from './ordenes'

export interface RendimientoCombo {
  comboId: string | undefined // undefined = órdenes sin combo (solo servicios sueltos)
  veces: number
  ingreso: number // Σ (precio − descuento) de las entregadas en el rango
  ticketPromedio: number
  tiempoPromedioSegundos: number | null
  participacion: number // % del ingreso total del rango
  porTipo: { tipoVehiculoId: string; veces: number; ingreso: number }[]
}

// Rendimiento de cada combo en [desde, hasta) — solo órdenes ENTREGADAS (las que dejaron plata).
// Ordenado por ingreso descendente: arriba lo que mueve el negocio.
export async function fetchRendimientoCombos(desdeISO: string, hastaISO: string): Promise<RendimientoCombo[]> {
  const ordenes = await fetchOrdenesEntregadasEnRango(desdeISO, hastaISO)
  const ingresoTotal = ordenes.reduce((s, o) => s + o.precio - o.descuento, 0)

  const acc = new Map<
    string,
    { veces: number; ingreso: number; tSum: number; tN: number; porTipo: Map<string, { veces: number; ingreso: number }> }
  >()
  for (const o of ordenes) {
    const key = o.comboId ?? '__sin_combo__'
    const a = acc.get(key) ?? { veces: 0, ingreso: 0, tSum: 0, tN: 0, porTipo: new Map() }
    const ing = o.precio - o.descuento
    a.veces += 1
    a.ingreso += ing
    if (o.tiempoLavadoSegundos != null) {
      a.tSum += o.tiempoLavadoSegundos
      a.tN += 1
    }
    const t = a.porTipo.get(o.tipoVehiculoId) ?? { veces: 0, ingreso: 0 }
    t.veces += 1
    t.ingreso += ing
    a.porTipo.set(o.tipoVehiculoId, t)
    acc.set(key, a)
  }

  return [...acc.entries()]
    .map(([key, a]) => ({
      comboId: key === '__sin_combo__' ? undefined : key,
      veces: a.veces,
      ingreso: a.ingreso,
      ticketPromedio: a.veces ? Math.round(a.ingreso / a.veces) : 0,
      tiempoPromedioSegundos: a.tN ? Math.round(a.tSum / a.tN) : null,
      participacion: ingresoTotal ? (a.ingreso / ingresoTotal) * 100 : 0,
      porTipo: [...a.porTipo.entries()]
        .map(([tipoVehiculoId, t]) => ({ tipoVehiculoId, veces: t.veces, ingreso: t.ingreso }))
        .sort((x, y) => y.ingreso - x.ingreso),
    }))
    .sort((x, y) => y.ingreso - x.ingreso)
}
