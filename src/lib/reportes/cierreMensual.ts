// Cierre mensual consolidado (Plan M11) — un PDF con el resultado del mes armado con las mismas
// cifras del panel de rentabilidad, más liquidaciones y arqueos del mes. Reutiliza el exportador
// A4 de /admin/reportes: cada sección es una tabla con su resumen.
import type { RentabilidadReporte } from '../../data/rentabilidad'
import { resultadoPorLinea } from '../../data/rentabilidad'
import { fetchLiquidaciones } from '../../data/liquidaciones'
import { fetchLiquidacionesJefeZona } from '../../data/liquidacionesJefeZona'
import { fetchTurnos } from '../../data/turnos'
import { fetchLavadores } from '../../data/lavadores'
import { rangoAISO, type RangoPeriodo } from '../periodo'
import { CLASE_VEHICULO_LABEL } from '../../schemas/estanciaParqueadero'
import type { ColumnaReporte, TablaReporte } from './tipos'

const col = (encabezado: string, tipo: ColumnaReporte['tipo'], ancho: number): ColumnaReporte => ({ encabezado, tipo, ancho })
const MODALIDAD = { noche: 'Noche', mensualidad: 'Mensualidad', fijo: 'Fijo 24h' } as const

export async function exportarCierreMensual(reporte: RentabilidadReporte, rango: RangoPeriodo) {
  const [liquidaciones, liquidacionesJZ, turnos, lavadores] = await Promise.all([
    fetchLiquidaciones(),
    fetchLiquidacionesJefeZona(),
    fetchTurnos(),
    fetchLavadores(),
  ])
  const enMes = (inicio: string, fin: string) => inicio <= rango.periodoFin && fin >= rango.periodoInicio
  const t = reporte.totales
  const linea = resultadoPorLinea(t)
  const ingresos = linea.ingresosTotales

  const resultado: TablaReporte = {
    columnas: [col('Línea', 'texto', 22), col('Ingresos', 'moneda', 14), col('Costos directos', 'moneda', 14), col('Gastos propios', 'moneda', 14), col('Margen', 'moneda', 14), col('Margen %', 'texto', 10)],
    filas: [
      ['Lavadero', linea.lavadero.ingresos, linea.lavadero.costosDirectos, linea.lavadero.gastos, linea.lavadero.utilidad, `${linea.lavadero.margen.toFixed(1)}%`],
      ['Productos', linea.productos.ingresos, linea.productos.costosDirectos, linea.productos.gastos, linea.productos.utilidad, `${linea.productos.margen.toFixed(1)}%`],
      ['Parqueadero', linea.parqueadero.ingresos, 0, linea.parqueadero.gastos, linea.parqueadero.utilidad, `${linea.parqueadero.margen.toFixed(1)}%`],
      ...(linea.otros.ingresos > 0
        ? [['Otros ingresos', linea.otros.ingresos, 0, 0, linea.otros.utilidad, `${linea.otros.margen.toFixed(1)}%`] as (string | number | null)[]]
        : []),
      ['Gastos generales', null, null, linea.gastosGenerales, -linea.gastosGenerales, ''],
      ['UTILIDAD NETA', ingresos, null, null, t.utilidadNeta, `${t.margen.toFixed(1)}%`],
    ],
    resumen: [
      { etiqueta: 'Ingresos', valor: ingresos, tipo: 'moneda' },
      { etiqueta: 'Utilidad neta', valor: t.utilidadNeta, tipo: 'moneda' },
      { etiqueta: 'Lavados', valor: reporte.cantidadLavados, tipo: 'numero' },
      { etiqueta: 'Descuentos absorbidos', valor: t.descuentos, tipo: 'moneda' },
    ],
  }

  const m = reporte.ingresosPorMetodo
  const metodos: TablaReporte = {
    columnas: [col('Método', 'texto', 20), col('Cobrado', 'moneda', 14)],
    filas: [
      ['Efectivo', m.efectivo],
      ['Transferencia', m.transferencia],
      ['Datáfono', m.datafono],
      ['Parqueadero (sin método)', t.ingresosParqueadero],
    ],
    resumen: [{ etiqueta: 'Total', valor: m.efectivo + m.transferencia + m.datafono + t.ingresosParqueadero, tipo: 'moneda' }],
  }

  const combos: TablaReporte = {
    columnas: [col('Combo', 'texto', 22), col('Lavados', 'numero', 8), col('Ingreso', 'moneda', 13), col('Comisiones', 'moneda', 13), col('Margen', 'moneda', 13), col('Margen %', 'texto', 9)],
    filas: reporte.porCombo.map((c) => [c.nombre, c.cantidad, c.ingreso, c.comisiones, c.margen, `${c.margenPct.toFixed(1)}%`]),
    resumen: [],
  }

  const gastos: TablaReporte = {
    columnas: [col('Categoría', 'texto', 24), col('Movimientos', 'numero', 10), col('Total', 'moneda', 14)],
    filas: reporte.gastosPorCategoria.map((g) => [g.nombre, g.cantidad, g.total]),
    resumen: [{ etiqueta: 'Total gastos', valor: t.gastos, tipo: 'moneda' }],
  }

  const parqueadero: TablaReporte = {
    columnas: [col('Modalidad', 'texto', 14), col('Vehículo', 'texto', 12), col('Salidas', 'numero', 8), col('Tarifas', 'moneda', 12), col('Multas', 'moneda', 12), col('Total', 'moneda', 12)],
    filas: reporte.parqueadero.map((p) => [MODALIDAD[p.modalidad], CLASE_VEHICULO_LABEL[p.clase], p.salidas, p.tarifas, p.multas, p.total]),
    resumen: [{ etiqueta: 'Total parqueadero', valor: t.ingresosParqueadero, tipo: 'moneda' }],
  }

  const nombreLavador = new Map(lavadores.map((l) => [l.id, l.nombre]))
  const liqMes = [
    ...liquidaciones.filter((l) => enMes(l.periodoInicio, l.periodoFin)).map((l) => ({ ...l, nombre: nombreLavador.get(l.lavadorId) ?? '—', rol: 'Lavador' })),
    ...liquidacionesJZ.filter((l) => enMes(l.periodoInicio, l.periodoFin)).map((l) => ({ ...l, nombre: l.responsable, rol: 'Jefe de patio' })),
  ]
  const estado = (l: { pagada: boolean; anulada: boolean }) => (l.anulada ? 'Anulada' : l.pagada ? 'Pagada' : 'Por pagar')
  const liq: TablaReporte = {
    columnas: [col('Persona', 'texto', 20), col('Rol', 'texto', 12), col('Periodo', 'texto', 20), col('Monto', 'moneda', 12), col('Estado', 'texto', 10)],
    filas: liqMes.map((l) => [l.nombre, l.rol, `${l.periodoInicio} → ${l.periodoFin}`, l.monto, estado(l)]),
    resumen: [
      { etiqueta: 'Pagado', valor: liqMes.filter((l) => l.pagada && !l.anulada).reduce((s, l) => s + l.monto, 0), tipo: 'moneda' },
      { etiqueta: 'Por pagar', valor: liqMes.filter((l) => !l.pagada && !l.anulada).reduce((s, l) => s + l.monto, 0), tipo: 'moneda' },
    ],
  }

  const { desdeISO, hastaISO } = rangoAISO(rango)
  const turnosMes = turnos.filter((tu) => tu.cerrado && tu.abiertoEn >= desdeISO && tu.abiertoEn < hastaISO)
  const caja: TablaReporte = {
    columnas: [col('Apertura', 'fechahora', 16), col('Rol', 'texto', 12), col('Responsable', 'texto', 18), col('Esperado', 'moneda', 12), col('Contado', 'moneda', 12), col('Diferencia', 'moneda', 12)],
    filas: turnosMes.map((tu) => [new Date(tu.abiertoEn), tu.rol === 'jefe_zona' ? 'Jefe de patio' : 'Vigilante', tu.responsable, tu.valorEsperado ?? null, tu.conteoFisico ?? null, tu.diferencia ?? 0]),
    resumen: [
      { etiqueta: 'Turnos', valor: turnosMes.length, tipo: 'numero' },
      { etiqueta: 'Con diferencia', valor: turnosMes.filter((tu) => (tu.diferencia ?? 0) !== 0).length, tipo: 'numero' },
      { etiqueta: 'Neto de diferencias', valor: turnosMes.reduce((s, tu) => s + (tu.diferencia ?? 0), 0), tipo: 'moneda' },
    ],
  }

  const secciones = [
    { info: { label: 'Cierre del mes · Resultado por línea de negocio' }, tabla: resultado },
    { info: { label: 'Cobrado por método de pago' }, tabla: metodos },
    { info: { label: 'Lavados por combo' }, tabla: combos },
    { info: { label: 'Gastos por categoría' }, tabla: gastos },
    { info: { label: 'Parqueadero por modalidad y vehículo' }, tabla: parqueadero },
    { info: { label: 'Liquidaciones del mes' }, tabla: liq },
    { info: { label: 'Caja: arqueos del mes' }, tabla: caja },
  ]
  const { exportarPdf } = await import('./exportarPdf')
  await exportarPdf(secciones, { ...rango, desdeISO, hastaISO }, 'cierre-mensual')
}
