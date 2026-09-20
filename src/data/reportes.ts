import { db } from '../lib/db'
import type { PeriodoReporte } from '../lib/reportes/tipos'

// Lecturas para la pantalla de reportes (/admin/operacion/reportes). Devuelven filas crudas por
// periodo, sin pasar por los fetchers de cada pantalla, por dos razones:
//   1. Supabase corta cada consulta en 1.000 filas. Un mes de pagos u órdenes puede pasarse, y un
//      reporte que se calla la mitad de las filas es peor que uno que falla — por eso todo pagina.
//   2. Cada reporte necesita el histórico completo del periodo (incluidas anuladas, inactivos,
//      etc.), no la vista filtrada que necesita una pantalla operativa.
// Solo admin: la restricción real es RLS, esta capa no filtra nada por rol.

const TAM_PAGINA = 1000

type Respuesta = { data: unknown[] | null; error: { message: string } | null }

// El orden de cada consulta termina siempre en `id` para que dos filas con el mismo timestamp no
// se salten ni se repitan entre páginas.
async function paginar<T>(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta>): Promise<T[]> {
  const todas: T[] = []
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await pedir(desde, desde + TAM_PAGINA - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as T[]
    todas.push(...pagina)
    if (pagina.length < TAM_PAGINA) return todas
  }
}

export interface NombresReporte {
  lavadores: Map<string, string>
  combos: Map<string, string>
  tiposVehiculo: Map<string, string>
  productos: Map<string, string>
  perfiles: Map<string, string>
}

async function mapaNombres(tabla: string): Promise<Map<string, string>> {
  const filas = await paginar<{ id: string; nombre: string }>((a, b) =>
    db.from(tabla).select('id, nombre').order('id').range(a, b),
  )
  return new Map(filas.map((f) => [f.id, f.nombre]))
}

// Incluye inactivos: un lavador o producto dado de baja sigue apareciendo en el histórico.
export async function fetchNombresReporte(): Promise<NombresReporte> {
  const [lavadores, combos, tiposVehiculo, productos, perfiles] = await Promise.all([
    mapaNombres('lavadores'),
    mapaNombres('combos'),
    mapaNombres('tipos_vehiculo'),
    mapaNombres('productos'),
    mapaNombres('perfiles'),
  ])
  return { lavadores, combos, tiposVehiculo, productos, perfiles }
}

export interface OrdenReporteFila {
  id: string
  consecutivo: number
  placa: string
  cliente_nombre: string | null
  tipo_vehiculo_id: string | null
  combo_id: string | null
  lavador_id: string | null
  lavador_id_2: string | null
  precio: number
  descuento: number | null
  descuento_motivo: string | null
  comision_lavador: number
  comision_negocio: number
  comision_jefe_zona: number | null
  metodo_pago: string | null
  estado: string
  creado_en: string
  entregada_en: string | null
  tiempo_lavado_segundos: number | null
  motivo_anulacion: string | null
  anulada_por: string | null
}

const ORDEN_COLS =
  'id, consecutivo, placa, cliente_nombre, tipo_vehiculo_id, combo_id, lavador_id, lavador_id_2, precio, descuento, descuento_motivo, comision_lavador, comision_negocio, comision_jefe_zona, metodo_pago, estado, creado_en, entregada_en, tiempo_lavado_segundos, motivo_anulacion, anulada_por'

export function fetchOrdenesReporte(p: PeriodoReporte): Promise<OrdenReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('ordenes')
      .select(ORDEN_COLS)
      .gte('creado_en', p.desdeISO)
      .lt('creado_en', p.hastaISO)
      .order('consecutivo', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface PagoReporteFila {
  id: string
  metodo_pago: string
  monto: number
  referencia_pago: string | null
  anulado: boolean
  es_correccion: boolean
  motivo_correccion: string | null
  creado_en: string
  orden_id: string | null
  venta_grupo_id: string | null
  cuenta_id: string | null
  orden: { consecutivo: number; placa: string } | null
}

export function fetchPagosReporte(p: PeriodoReporte): Promise<PagoReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('pagos')
      .select(
        'id, metodo_pago, monto, referencia_pago, anulado, es_correccion, motivo_correccion, creado_en, orden_id, venta_grupo_id, cuenta_id, orden:ordenes(consecutivo, placa)',
      )
      .gte('creado_en', p.desdeISO)
      .lt('creado_en', p.hastaISO)
      .order('creado_en', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface VentaReporteFila {
  id: string
  consecutivo: number
  producto_id: string
  cantidad: number
  precio_unitario: number
  total: number
  metodo_pago: string | null
  estado: string
  vendido_por: string | null
  motivo_anulacion: string | null
  creado_en: string
  cobrada_en: string | null
  a_costo: boolean
  orden_id: string | null
  cuenta_id: string | null
  orden: { consecutivo: number } | null
}

// Una venta cobrada cuenta en el día en que se cobró (`cobrada_en`, no en el que se cargó); una que
// no se cobró (pendiente o anulada) no tiene esa fecha y cuenta en el día en que se creó.
export function fetchVentasReporte(p: PeriodoReporte): Promise<VentaReporteFila[]> {
  const filtro =
    `and(cobrada_en.gte.${p.desdeISO},cobrada_en.lt.${p.hastaISO}),` +
    `and(cobrada_en.is.null,creado_en.gte.${p.desdeISO},creado_en.lt.${p.hastaISO})`
  return paginar((a, b) =>
    db
      .from('ventas')
      .select(
        'id, consecutivo, producto_id, cantidad, precio_unitario, total, metodo_pago, estado, vendido_por, motivo_anulacion, creado_en, cobrada_en, a_costo, orden_id, cuenta_id, orden:ordenes(consecutivo)',
      )
      .or(filtro)
      .order('consecutivo', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface GastoReporteFila {
  id: string
  fecha: string
  descripcion: string
  monto: number
  responsable: string | null
  origen: string
  creado_en: string
  categoria: { nombre: string } | null
}

export function fetchGastosReporte(p: PeriodoReporte): Promise<GastoReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('gastos')
      .select('id, fecha, descripcion, monto, responsable, origen, creado_en, categoria:categorias_gasto(nombre)')
      .gte('fecha', p.periodoInicio)
      .lte('fecha', p.periodoFin)
      .order('fecha', { ascending: false })
      .order('creado_en', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface CompraReporteFila {
  id: string
  consecutivo: number
  proveedor: string | null
  numero_factura: string | null
  fecha: string
  origen_pago: string
  total: number
  registrado_por: string | null
  estado: string
  motivo_anulacion: string | null
  creado_en: string
}

export function fetchComprasReporte(p: PeriodoReporte): Promise<CompraReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('compras')
      .select(
        'id, consecutivo, proveedor, numero_factura, fecha, origen_pago, total, registrado_por, estado, motivo_anulacion, creado_en',
      )
      .gte('creado_en', p.desdeISO)
      .lt('creado_en', p.hastaISO)
      .order('consecutivo', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface MovimientoReporteFila {
  id: string
  producto_id: string
  tipo: string
  cantidad: number
  costo_unitario: number | null
  motivo: string | null
  responsable: string | null
  creado_en: string
  venta_id: string | null
  compra_id: string | null
}

export function fetchMovimientosReporte(p: PeriodoReporte): Promise<MovimientoReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('movimientos_inventario')
      .select('id, producto_id, tipo, cantidad, costo_unitario, motivo, responsable, creado_en, venta_id, compra_id')
      .gte('creado_en', p.desdeISO)
      .lt('creado_en', p.hastaISO)
      .order('creado_en', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface TurnoReporteFila {
  id: string
  rol: string
  responsable: string
  responsable_actual: string | null
  base_inicial: number
  abierto_en: string
  cerrado: boolean
  conteo_fisico: number | null
  valor_esperado: number | null
  diferencia: number | null
  justificacion_diferencia: string | null
  cerrado_por: string | null
  cerrado_en: string | null
}

export function fetchTurnosReporte(p: PeriodoReporte): Promise<TurnoReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('turnos_caja')
      .select(
        'id, rol, responsable, responsable_actual, base_inicial, abierto_en, cerrado, conteo_fisico, valor_esperado, diferencia, justificacion_diferencia, cerrado_por, cerrado_en',
      )
      .gte('abierto_en', p.desdeISO)
      .lt('abierto_en', p.hastaISO)
      .order('abierto_en', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface LiquidacionReporteFila {
  id: string
  lavador_id: string | null
  responsable: string | null
  periodo_inicio: string
  periodo_fin: string
  monto: number
  pagada: boolean
  pagada_en: string | null
  creado_en: string
  anulada: boolean
  motivo_anulacion: string | null
  comision_bruta: number
  deuda_descontada: number
}

const LIQ_COLS =
  'id, periodo_inicio, periodo_fin, monto, pagada, pagada_en, creado_en, anulada, motivo_anulacion, comision_bruta, deuda_descontada'

export async function fetchLiquidacionesReporte(
  p: PeriodoReporte,
): Promise<{ lavadores: LiquidacionReporteFila[]; jefes: LiquidacionReporteFila[] }> {
  const [lavadores, jefes] = await Promise.all([
    paginar<LiquidacionReporteFila>((a, b) =>
      db
        .from('liquidaciones')
        .select(`${LIQ_COLS}, lavador_id`)
        .gte('creado_en', p.desdeISO)
        .lt('creado_en', p.hastaISO)
        .order('creado_en', { ascending: false })
        .order('id')
        .range(a, b),
    ),
    paginar<LiquidacionReporteFila>((a, b) =>
      db
        .from('liquidaciones_jefe_zona')
        .select(`${LIQ_COLS}, responsable`)
        .gte('creado_en', p.desdeISO)
        .lt('creado_en', p.hastaISO)
        .order('creado_en', { ascending: false })
        .order('id')
        .range(a, b),
    ),
  ])
  return { lavadores, jefes }
}

export interface DeudaReporteFila {
  id: string
  lavador_id: string | null
  persona_id: string | null
  tipo: string
  monto: number
  estado: string
  motivo: string | null
  registrado_por: string | null
  metodo_abono: string | null
  motivo_anulacion: string | null
  creado_en: string
}

export function fetchDeudasReporte(p: PeriodoReporte): Promise<DeudaReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('deudas_personal')
      .select('id, lavador_id, persona_id, tipo, monto, estado, motivo, registrado_por, metodo_abono, motivo_anulacion, creado_en')
      .gte('creado_en', p.desdeISO)
      .lt('creado_en', p.hastaISO)
      .order('creado_en', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface AsistenciaReporteFila {
  id: string
  lavador_id: string
  fecha: string
  hora_entrada: string | null
  registrado_por: string | null
}

export function fetchAsistenciaReporte(p: PeriodoReporte): Promise<AsistenciaReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('asistencias_lavadores')
      .select('id, lavador_id, fecha, hora_entrada, registrado_por')
      .gte('fecha', p.periodoInicio)
      .lte('fecha', p.periodoFin)
      .order('fecha', { ascending: false })
      .order('id')
      .range(a, b),
  )
}

export interface EstanciaReporteFila {
  id: string
  placa: string
  modalidad: string
  hora_ingreso: string
  hora_salida: string | null
  cobro: number | null
  metodo_pago: string | null
  estado: string
}

export function fetchParqueaderoReporte(p: PeriodoReporte): Promise<EstanciaReporteFila[]> {
  return paginar((a, b) =>
    db
      .from('estancias_parqueadero')
      .select('id, placa, modalidad, hora_ingreso, hora_salida, cobro, metodo_pago, estado')
      .gte('hora_ingreso', p.desdeISO)
      .lt('hora_ingreso', p.hastaISO)
      .order('hora_ingreso', { ascending: false })
      .order('id')
      .range(a, b),
  )
}
