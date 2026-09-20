import type { RangoPeriodo } from '../periodo'

// Un reporte es una tabla plana + un resumen de cifras. Esa forma es lo único que conocen los
// exportadores (Excel/PDF) y la vista previa — cada conjunto de datos (órdenes, pagos, gastos…) se
// reduce a esto en `definiciones.ts`, así agregar uno nuevo no toca nada de exportación.
export type TipoColumna = 'texto' | 'moneda' | 'numero' | 'fecha' | 'fechahora'

export type Celda = string | number | Date | null

export interface ColumnaReporte {
  encabezado: string
  tipo: TipoColumna
  /** Ancho relativo (caracteres aprox.) — Excel lo usa tal cual, el PDF lo usa como peso. */
  ancho: number
  /** `false` = columna solo de Excel: en la hoja A4 del PDF no caben las 20 columnas de una orden. */
  enPdf?: boolean
}

export interface ItemResumen {
  etiqueta: string
  valor: number
  tipo: 'moneda' | 'numero'
}

export interface TablaReporte {
  columnas: ColumnaReporte[]
  filas: Celda[][]
  resumen: ItemResumen[]
}

export type ReporteKey =
  | 'ordenes'
  | 'pagos'
  | 'ventas'
  | 'gastos'
  | 'compras'
  | 'movimientos'
  | 'turnos'
  | 'liquidaciones'
  | 'deudas'
  | 'asistencia'
  | 'parqueadero'

export interface ReporteInfo {
  key: ReporteKey
  label: string
  descripcion: string
}

/** Periodo pedido: fechas locales YYYY-MM-DD inclusivas + su equivalente [desde, hasta) en ISO. */
export interface PeriodoReporte extends RangoPeriodo {
  desdeISO: string
  hastaISO: string
}

export interface ReporteCargado {
  info: ReporteInfo
  tabla: TablaReporte
}
