import { fechaLocalISO } from '../periodo'
import type { Celda, ColumnaReporte, ItemResumen, PeriodoReporte } from './tipos'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const NUM = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })

const dos = (n: number) => String(n).padStart(2, '0')

export const formatoFecha = (d: Date) => `${dos(d.getDate())}/${dos(d.getMonth() + 1)}/${d.getFullYear()}`
// Formato manual (24 h) y no `toLocaleString`: en es-CO mete espacios angostos que la fuente
// estándar del PDF no puede dibujar.
export const formatoFechaHora = (d: Date) => `${formatoFecha(d)} ${dos(d.getHours())}:${dos(d.getMinutes())}`

export function formatoCelda(celda: Celda, tipo: ColumnaReporte['tipo']): string {
  if (celda === null || celda === '') return ''
  if (celda instanceof Date) return tipo === 'fecha' ? formatoFecha(celda) : formatoFechaHora(celda)
  if (typeof celda === 'number') return tipo === 'moneda' ? COP.format(celda) : NUM.format(celda)
  return celda
}

export const formatoResumen = (item: ItemResumen) =>
  item.tipo === 'moneda' ? COP.format(item.valor) : NUM.format(item.valor)

// Texto del periodo para encabezados: un solo día o "desde – hasta".
export function textoPeriodo(p: PeriodoReporte): string {
  const desde = formatoFecha(new Date(`${p.periodoInicio}T00:00:00`))
  const hasta = formatoFecha(new Date(`${p.periodoFin}T00:00:00`))
  return p.periodoInicio === p.periodoFin ? desde : `${desde} al ${hasta}`
}

// Sufijo de archivo: 2026-09-19 o 2026-09-01_a_2026-09-19.
export function sufijoArchivo(p: PeriodoReporte): string {
  return p.periodoInicio === p.periodoFin ? p.periodoInicio : `${p.periodoInicio}_a_${p.periodoFin}`
}

export const ahoraTexto = () => formatoFechaHora(new Date())

export const hoyISO = () => fechaLocalISO(new Date())

export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se libera después del clic: revocarla en el mismo tick puede cancelar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
