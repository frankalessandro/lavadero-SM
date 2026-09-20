import {
  fetchAsistenciaReporte,
  fetchComprasReporte,
  fetchDeudasReporte,
  fetchGastosReporte,
  fetchLiquidacionesReporte,
  fetchMovimientosReporte,
  fetchNombresReporte,
  fetchOrdenesReporte,
  fetchPagosReporte,
  fetchParqueaderoReporte,
  fetchTurnosReporte,
  fetchVentasReporte,
  type NombresReporte,
} from '../../data/reportes'
import { METODO_PAGO_LABEL } from '../metodoPago'
import type { MetodoPago } from '../../schemas/orden'
import type {
  Celda,
  ColumnaReporte,
  ItemResumen,
  PeriodoReporte,
  ReporteCargado,
  ReporteInfo,
  ReporteKey,
  TablaReporte,
  TipoColumna,
} from './tipos'

export const REPORTES: ReporteInfo[] = [
  { key: 'ordenes', label: 'Órdenes de lavado', descripcion: 'Cada orden con combo, lavador, precio, descuento y estado.' },
  { key: 'pagos', label: 'Pagos', descripcion: 'Cada línea de pago por método (efectivo, transferencia, datáfono).' },
  { key: 'ventas', label: 'Ventas de productos', descripcion: 'Nevera y vitrina: cobradas, pendientes y anuladas.' },
  { key: 'gastos', label: 'Gastos', descripcion: 'Gastos por categoría, con su origen (caja o gerencia).' },
  { key: 'compras', label: 'Compras de inventario', descripcion: 'Compras a proveedores y de dónde salió el pago.' },
  { key: 'movimientos', label: 'Movimientos de inventario', descripcion: 'Entradas, salidas y ajustes de cada producto.' },
  { key: 'turnos', label: 'Turnos y arqueos', descripcion: 'Apertura, cierre, conteo físico y diferencia de cada turno.' },
  { key: 'liquidaciones', label: 'Liquidaciones', descripcion: 'Liquidaciones de lavadores y jefes de patio generadas en el periodo.' },
  { key: 'deudas', label: 'Deudas del personal', descripcion: 'Préstamos, abonos, consumos y faltantes.' },
  { key: 'asistencia', label: 'Asistencia de lavadores', descripcion: 'Quién llegó cada día y a qué hora.' },
  { key: 'parqueadero', label: 'Parqueadero', descripcion: 'Estancias por modalidad, con su cobro.' },
]

// ---------------------------------------------------------------------------------------------
// Utilidades de armado
// ---------------------------------------------------------------------------------------------

const col = (encabezado: string, tipo: TipoColumna, ancho: number, enPdf = true): ColumnaReporte => ({
  encabezado,
  tipo,
  ancho,
  enPdf,
})

const suma = (nums: number[]) => nums.reduce((s, n) => s + n, 0)
const resumen = (etiqueta: string, valor: number, tipo: 'moneda' | 'numero' = 'numero'): ItemResumen => ({
  etiqueta,
  valor,
  tipo,
})

// Timestamp ISO -> Date (se muestra en hora local del navegador, igual que el resto de la app).
const ts = (iso: string | null | undefined): Date | null => (iso ? new Date(iso) : null)
// Columna `date` de Postgres (YYYY-MM-DD) -> Date local a medianoche; `new Date('YYYY-MM-DD')` la
// leería como UTC y en Colombia mostraría el día anterior.
const dia = (fecha: string | null | undefined): Date | null => {
  if (!fecha) return null
  const [y, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const nombreDe = (mapa: Map<string, string>, id: string | null | undefined, vacio = '—'): string =>
  id ? (mapa.get(id) ?? '—') : vacio

const metodo = (m: string | null | undefined): string =>
  m ? (METODO_PAGO_LABEL[m as MetodoPago] ?? m) : '—'

const ESTADO_ORDEN: Record<string, string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

const ROL_CAJA: Record<string, string> = { jefe_zona: 'Jefe de patio', vigilante: 'Vigilante', admin: 'Administrador' }

const TIPO_DEUDA: Record<string, string> = {
  prestamo: 'Préstamo',
  consumo: 'Consumo',
  faltante: 'Faltante',
  abono: 'Abono',
  liquidacion: 'Descuento en liquidación',
}

const MODALIDAD: Record<string, string> = { noche: 'Noche', mensualidad: 'Mensualidad', fijo: 'Fijo 24 h' }

// ---------------------------------------------------------------------------------------------
// Un armador por reporte
// ---------------------------------------------------------------------------------------------

async function ordenes(p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  const filas = await fetchOrdenesReporte(p)
  const entregadas = filas.filter((o) => o.estado === 'entregado')
  const anuladas = filas.filter((o) => o.estado === 'anulada')
  const cobrado = (o: (typeof filas)[number]) => o.precio - (o.descuento ?? 0)
  const vigentes = filas.filter((o) => o.estado !== 'anulada')
  return {
    columnas: [
      col('Consec.', 'numero', 8),
      col('Creada', 'fechahora', 17),
      col('Placa', 'texto', 9),
      col('Cliente', 'texto', 18),
      col('Tipo vehículo', 'texto', 13),
      col('Combo', 'texto', 16),
      col('Lavador', 'texto', 14),
      col('Estado', 'texto', 11),
      col('Precio', 'moneda', 11),
      col('Descuento', 'moneda', 11),
      col('Cobrado', 'moneda', 11),
      col('Pago', 'texto', 13),
      col('Lavador 2', 'texto', 14, false),
      col('Comisión lavador', 'moneda', 14, false),
      col('Comisión negocio', 'moneda', 14, false),
      col('Comisión jefe patio', 'moneda', 14, false),
      col('Entregada', 'fechahora', 17, false),
      col('Tiempo lavado (min)', 'numero', 12, false),
      col('Motivo descuento', 'texto', 24, false),
      col('Motivo anulación', 'texto', 28, false),
      col('Anulada por', 'texto', 16, false),
    ],
    filas: filas.map((o): Celda[] => [
      o.consecutivo,
      ts(o.creado_en),
      o.placa,
      o.cliente_nombre ?? '',
      nombreDe(n.tiposVehiculo, o.tipo_vehiculo_id),
      o.combo_id ? nombreDe(n.combos, o.combo_id) : 'Sin combo',
      o.lavador_id ? nombreDe(n.lavadores, o.lavador_id) : 'Sin asignar',
      ESTADO_ORDEN[o.estado] ?? o.estado,
      o.precio,
      o.descuento ?? 0,
      o.estado === 'entregado' ? cobrado(o) : null,
      metodo(o.metodo_pago),
      o.lavador_id_2 ? nombreDe(n.lavadores, o.lavador_id_2) : '',
      o.comision_lavador,
      o.comision_negocio,
      o.comision_jefe_zona ?? 0,
      ts(o.entregada_en),
      o.tiempo_lavado_segundos != null ? Math.round(o.tiempo_lavado_segundos / 60) : null,
      o.descuento_motivo ?? '',
      o.motivo_anulacion ?? '',
      o.anulada_por ?? '',
    ]),
    resumen: [
      resumen('Órdenes', filas.length),
      resumen('Entregadas', entregadas.length),
      resumen('Anuladas', anuladas.length),
      resumen('Ingresos cobrados', suma(entregadas.map(cobrado)), 'moneda'),
      resumen('Descuentos', suma(entregadas.map((o) => o.descuento ?? 0)), 'moneda'),
      resumen('Ticket promedio', entregadas.length ? Math.round(suma(entregadas.map(cobrado)) / entregadas.length) : 0, 'moneda'),
      resumen('Comisión lavadores', suma(vigentes.map((o) => o.comision_lavador)), 'moneda'),
    ],
  }
}

async function pagos(p: PeriodoReporte): Promise<TablaReporte> {
  const filas = await fetchPagosReporte(p)
  const vigentes = filas.filter((f) => !f.anulado)
  const por = (m: string) => suma(vigentes.filter((f) => f.metodo_pago === m).map((f) => f.monto))
  const origen = (f: (typeof filas)[number]) =>
    f.orden ? `Orden #${f.orden.consecutivo} · ${f.orden.placa}` : f.venta_grupo_id ? 'Venta de mostrador' : f.cuenta_id ? 'Cuenta' : '—'
  return {
    columnas: [
      col('Fecha', 'fechahora', 17),
      col('Origen', 'texto', 24),
      col('Método', 'texto', 14),
      col('Monto', 'moneda', 12),
      col('Referencia', 'texto', 18),
      col('Estado', 'texto', 14),
      col('Motivo corrección', 'texto', 28),
    ],
    filas: filas.map((f): Celda[] => [
      ts(f.creado_en),
      origen(f),
      metodo(f.metodo_pago),
      f.monto,
      f.referencia_pago ?? '',
      f.anulado ? 'Anulado' : f.es_correccion ? 'Corrección' : 'Vigente',
      f.motivo_correccion ?? '',
    ]),
    resumen: [
      resumen('Efectivo', por('efectivo'), 'moneda'),
      resumen('Transferencia', por('transferencia'), 'moneda'),
      resumen('Datáfono', por('datafono'), 'moneda'),
      resumen('Total vigente', suma(vigentes.map((f) => f.monto)), 'moneda'),
      resumen('Líneas anuladas', filas.length - vigentes.length),
    ],
  }
}

async function ventas(p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  const filas = await fetchVentasReporte(p)
  const cobradas = filas.filter((v) => v.estado === 'activa')
  const pendientes = filas.filter((v) => v.estado === 'pendiente')
  const origen = (v: (typeof filas)[number]) =>
    v.orden ? `En orden #${v.orden.consecutivo}` : v.cuenta_id ? 'Cuenta' : 'Mostrador'
  return {
    columnas: [
      col('Consec.', 'numero', 8),
      col('Cobrada', 'fechahora', 17),
      col('Producto', 'texto', 24),
      col('Cant.', 'numero', 7),
      col('Precio unit.', 'moneda', 12),
      col('Total', 'moneda', 12),
      col('Estado', 'texto', 12),
      col('Método', 'texto', 14),
      col('Origen', 'texto', 16),
      col('Vendido por', 'texto', 16),
      col('Cargada', 'fechahora', 17, false),
      col('A costo', 'texto', 9, false),
      col('Motivo anulación', 'texto', 26, false),
    ],
    filas: filas.map((v): Celda[] => [
      v.consecutivo,
      ts(v.cobrada_en),
      nombreDe(n.productos, v.producto_id),
      v.cantidad,
      v.precio_unitario,
      v.total,
      v.estado === 'activa' ? 'Cobrada' : v.estado === 'pendiente' ? 'Pendiente' : 'Anulada',
      metodo(v.metodo_pago),
      origen(v),
      v.vendido_por ?? '',
      ts(v.creado_en),
      v.a_costo ? 'Sí' : '',
      v.motivo_anulacion ?? '',
    ]),
    resumen: [
      resumen('Ventas cobradas', cobradas.length),
      resumen('Total cobrado', suma(cobradas.map((v) => v.total)), 'moneda'),
      resumen('Unidades vendidas', suma(cobradas.map((v) => v.cantidad))),
      resumen('Pendientes de cobro', suma(pendientes.map((v) => v.total)), 'moneda'),
      resumen('Anuladas', filas.filter((v) => v.estado === 'anulada').length),
    ],
  }
}

async function gastos(p: PeriodoReporte): Promise<TablaReporte> {
  const filas = await fetchGastosReporte(p)
  return {
    columnas: [
      col('Fecha', 'fecha', 12),
      col('Categoría', 'texto', 20),
      col('Descripción', 'texto', 36),
      col('Monto', 'moneda', 12),
      col('Origen', 'texto', 14),
      col('Responsable', 'texto', 18),
    ],
    filas: filas.map((g): Celda[] => [
      dia(g.fecha),
      g.categoria?.nombre ?? '—',
      g.descripcion,
      g.monto,
      g.origen === 'caja' ? 'Caja' : 'Otro',
      g.responsable ?? '',
    ]),
    resumen: [
      resumen('Gastos', filas.length),
      resumen('Total', suma(filas.map((g) => g.monto)), 'moneda'),
      resumen('De caja', suma(filas.filter((g) => g.origen === 'caja').map((g) => g.monto)), 'moneda'),
      resumen('Otros', suma(filas.filter((g) => g.origen !== 'caja').map((g) => g.monto)), 'moneda'),
    ],
  }
}

async function compras(p: PeriodoReporte): Promise<TablaReporte> {
  const filas = await fetchComprasReporte(p)
  const vigentes = filas.filter((c) => c.estado !== 'anulada')
  return {
    columnas: [
      col('Consec.', 'numero', 8),
      col('Fecha', 'fecha', 12),
      col('Proveedor', 'texto', 22),
      col('Factura', 'texto', 14),
      col('Origen del pago', 'texto', 15),
      col('Total', 'moneda', 12),
      col('Estado', 'texto', 11),
      col('Registrada por', 'texto', 18),
      col('Motivo anulación', 'texto', 26, false),
    ],
    filas: filas.map((c): Celda[] => [
      c.consecutivo,
      dia(c.fecha),
      c.proveedor ?? '',
      c.numero_factura ?? '',
      c.origen_pago === 'caja' ? 'Caja del turno' : 'Gerencia',
      c.total,
      c.estado === 'anulada' ? 'Anulada' : 'Vigente',
      c.registrado_por ?? '',
      c.motivo_anulacion ?? '',
    ]),
    resumen: [
      resumen('Compras', vigentes.length),
      resumen('Total comprado', suma(vigentes.map((c) => c.total)), 'moneda'),
      resumen('Pagado de caja', suma(vigentes.filter((c) => c.origen_pago === 'caja').map((c) => c.total)), 'moneda'),
      resumen('Pagado por gerencia', suma(vigentes.filter((c) => c.origen_pago !== 'caja').map((c) => c.total)), 'moneda'),
      resumen('Anuladas', filas.length - vigentes.length),
    ],
  }
}

async function movimientos(p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  const filas = await fetchMovimientosReporte(p)
  const cuenta = (t: string) => filas.filter((m) => m.tipo === t).length
  return {
    columnas: [
      col('Fecha', 'fechahora', 17),
      col('Producto', 'texto', 26),
      col('Tipo', 'texto', 10),
      col('Cantidad', 'numero', 10),
      col('Costo unit.', 'moneda', 12),
      col('Origen', 'texto', 12),
      col('Responsable', 'texto', 18),
      col('Motivo', 'texto', 34),
    ],
    filas: filas.map((m): Celda[] => [
      ts(m.creado_en),
      nombreDe(n.productos, m.producto_id),
      m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'salida' ? 'Salida' : 'Ajuste',
      m.cantidad,
      m.costo_unitario,
      m.venta_id ? 'Venta' : m.compra_id ? 'Compra' : 'Manual',
      m.responsable ?? '',
      m.motivo ?? '',
    ]),
    resumen: [
      resumen('Movimientos', filas.length),
      resumen('Entradas', cuenta('entrada')),
      resumen('Salidas', cuenta('salida')),
      resumen('Ajustes', cuenta('ajuste')),
    ],
  }
}

async function turnos(p: PeriodoReporte): Promise<TablaReporte> {
  const filas = await fetchTurnosReporte(p)
  const conDiferencia = filas.filter((t) => t.cerrado && (t.diferencia ?? 0) !== 0)
  return {
    columnas: [
      col('Rol', 'texto', 14),
      col('Responsable', 'texto', 18),
      col('Abierto', 'fechahora', 17),
      col('Cerrado', 'fechahora', 17),
      col('Estado', 'texto', 10),
      col('Base inicial', 'moneda', 13),
      col('Valor esperado', 'moneda', 14),
      col('Conteo físico', 'moneda', 14),
      col('Diferencia', 'moneda', 12),
      col('Justificación', 'texto', 34),
      col('Cerrado por', 'texto', 18, false),
    ],
    filas: filas.map((t): Celda[] => [
      ROL_CAJA[t.rol] ?? t.rol,
      t.responsable,
      ts(t.abierto_en),
      ts(t.cerrado_en),
      t.cerrado ? 'Cerrado' : 'Abierto',
      t.base_inicial,
      t.valor_esperado,
      t.conteo_fisico,
      t.diferencia,
      t.justificacion_diferencia ?? '',
      t.cerrado_por ?? '',
    ]),
    resumen: [
      resumen('Turnos', filas.length),
      resumen('Cerrados', filas.filter((t) => t.cerrado).length),
      resumen('Con diferencia', conDiferencia.length),
      resumen('Diferencia neta', suma(conDiferencia.map((t) => t.diferencia ?? 0)), 'moneda'),
    ],
  }
}

async function liquidaciones(p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  const { lavadores, jefes } = await fetchLiquidacionesReporte(p)
  const todas = [
    ...lavadores.map((l) => ({ l, tipo: 'Lavador', quien: nombreDe(n.lavadores, l.lavador_id) })),
    ...jefes.map((l) => ({ l, tipo: 'Jefe de patio', quien: l.responsable ?? '—' })),
  ].sort((a, b) => b.l.creado_en.localeCompare(a.l.creado_en))
  const vigentes = todas.filter((x) => !x.l.anulada)
  const estado = (x: (typeof todas)[number]) => (x.l.anulada ? 'Anulada' : x.l.pagada ? 'Pagada' : 'Pendiente de pago')
  return {
    columnas: [
      col('Generada', 'fechahora', 17),
      col('Tipo', 'texto', 13),
      col('Persona', 'texto', 18),
      col('Periodo desde', 'fecha', 13),
      col('Periodo hasta', 'fecha', 13),
      col('Comisión bruta', 'moneda', 14),
      col('Deuda descontada', 'moneda', 15),
      col('Monto a pagar', 'moneda', 14),
      col('Estado', 'texto', 16),
      col('Pagada en', 'fechahora', 17, false),
      col('Motivo anulación', 'texto', 28, false),
    ],
    filas: todas.map((x): Celda[] => [
      ts(x.l.creado_en),
      x.tipo,
      x.quien,
      dia(x.l.periodo_inicio),
      dia(x.l.periodo_fin),
      x.l.comision_bruta,
      x.l.deuda_descontada,
      x.l.monto,
      estado(x),
      ts(x.l.pagada_en),
      x.l.motivo_anulacion ?? '',
    ]),
    resumen: [
      resumen('Liquidaciones', vigentes.length),
      resumen('Comisión bruta', suma(vigentes.map((x) => x.l.comision_bruta)), 'moneda'),
      resumen('Deuda descontada', suma(vigentes.map((x) => x.l.deuda_descontada)), 'moneda'),
      resumen('Monto a pagar', suma(vigentes.map((x) => x.l.monto)), 'moneda'),
      resumen('Pendientes de pago', vigentes.filter((x) => !x.l.pagada).length),
      resumen('Anuladas', todas.length - vigentes.length),
    ],
  }
}

async function deudas(p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  const filas = await fetchDeudasReporte(p)
  const activas = filas.filter((d) => d.estado === 'activo')
  const tot = (t: string) => suma(activas.filter((d) => d.tipo === t).map((d) => d.monto))
  return {
    columnas: [
      col('Fecha', 'fechahora', 17),
      col('Persona', 'texto', 18),
      col('Tipo', 'texto', 22),
      col('Monto', 'moneda', 12),
      col('Estado', 'texto', 10),
      col('Registrado por', 'texto', 18),
      col('Motivo', 'texto', 34),
      col('Método de abono', 'texto', 14, false),
      col('Motivo anulación', 'texto', 26, false),
    ],
    filas: filas.map((d): Celda[] => [
      ts(d.creado_en),
      d.lavador_id ? nombreDe(n.lavadores, d.lavador_id) : nombreDe(n.perfiles, d.persona_id),
      TIPO_DEUDA[d.tipo] ?? d.tipo,
      d.monto,
      d.estado === 'activo' ? 'Vigente' : 'Anulado',
      d.registrado_por ?? '',
      d.motivo ?? '',
      d.metodo_abono ? metodo(d.metodo_abono) : '',
      d.motivo_anulacion ?? '',
    ]),
    resumen: [
      resumen('Movimientos', activas.length),
      resumen('Préstamos', tot('prestamo'), 'moneda'),
      resumen('Consumos', tot('consumo'), 'moneda'),
      resumen('Faltantes', tot('faltante'), 'moneda'),
      resumen('Abonos', tot('abono'), 'moneda'),
      resumen('Descontado en liquidaciones', Math.abs(tot('liquidacion')), 'moneda'),
    ],
  }
}

async function asistencia(p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  const filas = await fetchAsistenciaReporte(p)
  return {
    columnas: [
      col('Fecha', 'fecha', 12),
      col('Lavador', 'texto', 20),
      col('Hora de entrada', 'fechahora', 18),
      col('Registrado por', 'texto', 20),
    ],
    filas: filas.map((a): Celda[] => [dia(a.fecha), nombreDe(n.lavadores, a.lavador_id), ts(a.hora_entrada), a.registrado_por ?? '']),
    resumen: [
      resumen('Registros de asistencia', filas.length),
      resumen('Lavadores distintos', new Set(filas.map((a) => a.lavador_id)).size),
      resumen('Días con registro', new Set(filas.map((a) => a.fecha)).size),
    ],
  }
}

async function parqueadero(p: PeriodoReporte): Promise<TablaReporte> {
  const filas = await fetchParqueaderoReporte(p)
  const cobradas = filas.filter((e) => (e.cobro ?? 0) > 0)
  return {
    columnas: [
      col('Placa', 'texto', 10),
      col('Modalidad', 'texto', 14),
      col('Ingreso', 'fechahora', 17),
      col('Salida', 'fechahora', 17),
      col('Estado', 'texto', 10),
      col('Cobro', 'moneda', 12),
      col('Método', 'texto', 14),
    ],
    filas: filas.map((e): Celda[] => [
      e.placa,
      MODALIDAD[e.modalidad] ?? e.modalidad,
      ts(e.hora_ingreso),
      ts(e.hora_salida),
      e.estado === 'adentro' ? 'Adentro' : 'Fuera',
      e.cobro ?? 0,
      metodo(e.metodo_pago),
    ]),
    resumen: [
      resumen('Estancias', filas.length),
      resumen('Con cobro', cobradas.length),
      resumen('Total cobrado', suma(cobradas.map((e) => e.cobro ?? 0)), 'moneda'),
    ],
  }
}

// ---------------------------------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------------------------------

async function armar(key: ReporteKey, p: PeriodoReporte, n: NombresReporte): Promise<TablaReporte> {
  switch (key) {
    case 'ordenes':
      return ordenes(p, n)
    case 'pagos':
      return pagos(p)
    case 'ventas':
      return ventas(p, n)
    case 'gastos':
      return gastos(p)
    case 'compras':
      return compras(p)
    case 'movimientos':
      return movimientos(p, n)
    case 'turnos':
      return turnos(p)
    case 'liquidaciones':
      return liquidaciones(p, n)
    case 'deudas':
      return deudas(p, n)
    case 'asistencia':
      return asistencia(p, n)
    case 'parqueadero':
      return parqueadero(p)
  }
}

export function infoDe(key: ReporteKey): ReporteInfo {
  return REPORTES.find((r) => r.key === key) ?? REPORTES[0]
}

export async function cargarReporte(key: ReporteKey, p: PeriodoReporte): Promise<ReporteCargado> {
  const nombres = await fetchNombresReporte()
  return { info: infoDe(key), tabla: await armar(key, p, nombres) }
}

// Todos los reportes del periodo, con una sola lectura de nombres. Se piden en paralelo: son
// tablas distintas y el periodo suele ser corto; si un mes completo pesara, esto es lo primero que
// se serializaría.
export async function cargarTodosLosReportes(p: PeriodoReporte): Promise<ReporteCargado[]> {
  const nombres = await fetchNombresReporte()
  return Promise.all(
    REPORTES.map(async (info) => ({ info, tabla: await armar(info.key, p, nombres) })),
  )
}
