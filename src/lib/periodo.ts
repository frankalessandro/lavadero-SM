export type ModoPeriodo = 'dia' | 'semana' | 'mes'

export function fechaLocalISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

function sumarDias(fecha: Date, dias: number): Date {
  const copia = new Date(fecha)
  copia.setDate(copia.getDate() + dias)
  return copia
}

// Lunes de la semana calendario del ancla (domingo cuenta como el último día de la semana que
// empezó el lunes anterior) — mismo criterio que ya usa /jefe-zona/asistencia.
export function lunesDeLaSemana(fecha: Date): Date {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  const diaSemana = copia.getDay()
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  return sumarDias(copia, offset)
}

export interface RangoPeriodo {
  periodoInicio: string
  periodoFin: string
  label: string
}

const DIA_MES_LABEL = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
const DIA_MES_ANIO_LABEL = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
const MES_COMPLETO_LABEL = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })

// Calcula el rango [periodoInicio, periodoFin] (fechas YYYY-MM-DD, ambas inclusivas) y una
// etiqueta legible para el modo y ancla dados — misma forma de fecha que ya esperan
// fetchMontoPeriodo/generarLiquidacion (ver src/data/liquidaciones.ts), así que el resultado se
// puede pasar directo sin transformar.
export function calcularRango(modo: ModoPeriodo, ancla: Date): RangoPeriodo {
  if (modo === 'dia') {
    return { periodoInicio: fechaLocalISO(ancla), periodoFin: fechaLocalISO(ancla), label: DIA_MES_ANIO_LABEL.format(ancla) }
  }
  if (modo === 'semana') {
    const inicio = lunesDeLaSemana(ancla)
    const fin = sumarDias(inicio, 6)
    const mismomes = inicio.getMonth() === fin.getMonth()
    const label = mismomes
      ? `${inicio.getDate()} – ${DIA_MES_ANIO_LABEL.format(fin)}`
      : `${DIA_MES_LABEL.format(inicio)} – ${DIA_MES_ANIO_LABEL.format(fin)}`
    return { periodoInicio: fechaLocalISO(inicio), periodoFin: fechaLocalISO(fin), label }
  }
  const inicio = new Date(ancla.getFullYear(), ancla.getMonth(), 1)
  const fin = new Date(ancla.getFullYear(), ancla.getMonth() + 1, 0)
  return { periodoInicio: fechaLocalISO(inicio), periodoFin: fechaLocalISO(fin), label: MES_COMPLETO_LABEL.format(inicio) }
}

export function moverAncla(modo: ModoPeriodo, ancla: Date, direccion: 1 | -1): Date {
  if (modo === 'dia') return sumarDias(ancla, direccion)
  if (modo === 'semana') return sumarDias(ancla, 7 * direccion)
  return new Date(ancla.getFullYear(), ancla.getMonth() + direccion, 1)
}
