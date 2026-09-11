import { fetchOrdenesEntregadasEnRango } from './ordenes'
import { fetchSalidasParqueaderoEnRango } from './estanciasParqueadero'
import { fetchVentasEnRango, fetchCostoMercanciaVendidaPorVenta } from './ventas'
import { fetchGastos, type GastoConCategoria } from './gastos'
import type { LineaNegocio } from '../schemas/gasto'
import { fetchCombos } from './combos'
import { fetchLavadores } from './lavadores'
import { fetchTiposVehiculo } from './tiposVehiculo'
import { fetchProductos } from './productos'
import { fechaLocalISO } from '../lib/periodo'
import type { Orden } from '../schemas/orden'

// Panel de rentabilidad (/admin/rentabilidad): la misma cascada de "Resultado del día" del
// dashboard de admin, pero para cualquier periodo (día/semana/mes) y con todo el desglose que un
// dueño necesita — por día, por semana, por lavador, por combo, por categoría de gasto.
//
// La fórmula del núcleo es idéntica a la de src/routes/admin/index.tsx: si el periodo elegido es
// "hoy", cada renglón debe cuadrar exactamente con la tarjeta "Resultado del día". No descuenta el
// consumo de insumos de lavado (mismo hueco conocido que el dashboard) y `ventasSinCosto` se
// reporta aparte para poder advertir que la utilidad sale algo más alta de lo real.

export interface RentabilidadDia {
  fecha: string // YYYY-MM-DD local
  ingresosLavadero: number
  ingresosParqueadero: number
  ingresosVentas: number
  descuentos: number
  comisionLavadores: number
  comisionJefeZona: number
  costoMercancia: number
  gastos: number
  utilidadNeta: number
  margen: number // utilidadNeta / ingresos totales * 100 (0 si no hubo ingresos)
  // Ventas activas del día cuyo producto no tiene costo registrado (ni oficial ni una entrada con
  // costo capturado) — su costo cuenta como $0, así que la utilidad del día sale algo alta.
  ventasSinCosto: number

  // --- Reparto de `gastos` por línea de negocio (0059) ---
  // Los cuatro suman exactamente `gastos`. `gastosGenerales` es lo que no se atribuye a ninguna
  // línea (categoría sin `linea`: arriendo, servicios públicos, nómina admin) y se resta del
  // consolidado, no de una línea. Ver `resultadoPorLinea`.
  gastosLavadero: number
  gastosProductos: number
  gastosParqueadero: number
  gastosGenerales: number

  // --- Desglose de la línea de productos por sección (0058) ---
  // Bebidas + snacks suman `ingresosVentas` / `costoMercancia` salvo que algún producto vendible
  // haya quedado sin sección, en cuyo caso la diferencia cae en `...SinSeccion`.
  ingresosBebidas: number
  costoBebidas: number
  ingresosSnacks: number
  costoSnacks: number
  ingresosSinSeccion: number
  costoSinSeccion: number
}

export type RentabilidadTotales = Omit<RentabilidadDia, 'fecha'>

export interface RentabilidadPeriodo {
  porDia: RentabilidadDia[]
  totales: RentabilidadTotales
}

export interface LavadorRentabilidad {
  lavadorId: string
  nombre: string
  ordenes: number
  ingresoLista: number // suma de `precio` (lista) de las órdenes donde participó
  descuento: number
  comision: number // ya con la mitad aplicada en órdenes de dos lavadores
  pctComisionDelTotal: number
}

export interface ComboRentabilidad {
  comboId: string
  nombre: string
  categoria: string
  cantidad: number
  ingreso: number // neto de descuento
  ticketPromedio: number
}

export interface GastoCategoriaRentabilidad {
  categoriaId: string
  nombre: string
  total: number
  cantidad: number
}

export interface ProductoRentabilidad {
  productoId: string
  nombre: string
  cantidad: number
  ingreso: number
  costo: number
  margen: number // ingreso - costo
}

export interface OrdenRentabilidadLinea {
  consecutivo: number
  fecha: string // ISO de entregada_en
  placa: string
  tipoNombre: string
  comboNombre: string
  lavadorNombre: string
  precio: number
  descuento: number
  neto: number
  comisionLavador: number
  comisionJefeZona: number
  metodoPago: string
  jefeZonaResponsable: string
}

export interface VentaRentabilidadLinea {
  fecha: string // ISO de creado_en
  productoNombre: string
  cantidad: number
  total: number
}

export interface RentabilidadReporte extends RentabilidadPeriodo {
  // Totales del rango de igual longitud inmediatamente anterior — para los indicadores ▲▼.
  comparativa: RentabilidadTotales
  porLavador: LavadorRentabilidad[]
  porCombo: ComboRentabilidad[]
  gastosPorCategoria: GastoCategoriaRentabilidad[]
  productos: ProductoRentabilidad[]
  ordenes: OrdenRentabilidadLinea[]
  ventas: VentaRentabilidadLinea[]
  gastos: GastoConCategoria[]
  // Métricas sueltas del periodo para la fila de indicadores.
  cantidadLavados: number
  cantidadProductos: number
  ticketPromedioLavado: number
  diaMasRentable: RentabilidadDia | null
  diaMenosRentable: RentabilidadDia | null
}

export function totalesVacio(): RentabilidadTotales {
  return {
    ingresosLavadero: 0,
    ingresosParqueadero: 0,
    ingresosVentas: 0,
    descuentos: 0,
    comisionLavadores: 0,
    comisionJefeZona: 0,
    costoMercancia: 0,
    gastos: 0,
    utilidadNeta: 0,
    margen: 0,
    ventasSinCosto: 0,
    gastosLavadero: 0,
    gastosProductos: 0,
    gastosParqueadero: 0,
    gastosGenerales: 0,
    ingresosBebidas: 0,
    costoBebidas: 0,
    ingresosSnacks: 0,
    costoSnacks: 0,
    ingresosSinSeccion: 0,
    costoSinSeccion: 0,
  }
}

/** Campos numéricos acumulables de `RentabilidadTotales` (todo menos los dos derivados). */
const CAMPOS_ACUMULABLES = [
  'ingresosLavadero',
  'ingresosParqueadero',
  'ingresosVentas',
  'descuentos',
  'comisionLavadores',
  'comisionJefeZona',
  'costoMercancia',
  'gastos',
  'ventasSinCosto',
  'gastosLavadero',
  'gastosProductos',
  'gastosParqueadero',
  'gastosGenerales',
  'ingresosBebidas',
  'costoBebidas',
  'ingresosSnacks',
  'costoSnacks',
  'ingresosSinSeccion',
  'costoSinSeccion',
] as const satisfies readonly (keyof RentabilidadTotales)[]

/** Suma `origen` dentro de `destino`, campo por campo. No toca los derivados (`utilidadNeta`/`margen`). */
export function acumularTotales(destino: RentabilidadTotales, origen: RentabilidadTotales) {
  for (const campo of CAMPOS_ACUMULABLES) destino[campo] += origen[campo]
}

function diaVacio(fecha: string): RentabilidadDia {
  return { fecha, ...totalesVacio() }
}

function recalcular(d: RentabilidadDia | RentabilidadTotales) {
  d.utilidadNeta =
    d.ingresosLavadero +
    d.ingresosParqueadero +
    d.ingresosVentas -
    d.comisionLavadores -
    d.comisionJefeZona -
    d.costoMercancia -
    d.gastos
  const ingresos = d.ingresosLavadero + d.ingresosParqueadero + d.ingresosVentas
  d.margen = ingresos > 0 ? (d.utilidadNeta / ingresos) * 100 : 0
}

// ---------------------------------------------------------------------------------------------
// P&L por línea de negocio
// ---------------------------------------------------------------------------------------------

export interface LineaResultado {
  ingresos: number
  /** Costos directos de la línea: comisiones en lavadero, costo de mercancía en productos. */
  costosDirectos: number
  /** Gastos de categorías tagueadas a esta línea (0059). */
  gastos: number
  utilidad: number
  /** utilidad / ingresos de ESTA línea × 100 — el número que el 60/40 tiene que reflejar. */
  margen: number
}

export interface SeccionResultado extends LineaResultado {
  seccion: 'bebida' | 'snack' | 'sin_seccion'
  label: string
}

export interface ResultadoPorLinea {
  lavadero: LineaResultado & { comisionLavadores: number; comisionJefeZona: number; descuentos: number }
  productos: LineaResultado & { costoMercancia: number; porSeccion: SeccionResultado[] }
  parqueadero: LineaResultado
  /** Gastos que no se atribuyen a ninguna línea — se restan una sola vez, acá abajo. */
  gastosGenerales: number
  /** Suma de la utilidad de las tres líneas, antes de gastos generales. */
  margenBrutoTotal: number
  /** margenBrutoTotal − gastosGenerales. Idéntico a `totales.utilidadNeta`. */
  utilidadNeta: number
  ingresosTotales: number
}

/**
 * En cuál de los cuatro cubos de gasto cae una categoría. Sin línea = general (ver 0059).
 * Compartido entre el agregado por día y el dashboard, para que los dos repartan igual.
 */
export function bucketGasto(gasto: {
  categoriaLinea?: LineaNegocio
}): 'gastosLavadero' | 'gastosProductos' | 'gastosParqueadero' | 'gastosGenerales' {
  switch (gasto.categoriaLinea) {
    case 'lavadero':
      return 'gastosLavadero'
    case 'productos':
      return 'gastosProductos'
    case 'parqueadero':
      return 'gastosParqueadero'
    default:
      return 'gastosGenerales'
  }
}

function linea(ingresos: number, costosDirectos: number, gastos: number): LineaResultado {
  const utilidad = ingresos - costosDirectos - gastos
  return { ingresos, costosDirectos, gastos, utilidad, margen: ingresos > 0 ? (utilidad / ingresos) * 100 : 0 }
}

/**
 * Descompone los totales del periodo en un P&L por línea de negocio.
 *
 * Existe porque la cascada anterior calculaba cada barra como porcentaje de los ingresos TOTALES:
 * la comisión del lavador salía como ~37 % (y bajando cada vez que se vendían más gaseosas) aunque
 * el badge dijera 40 %, porque el denominador incluía parqueadero y productos, que no pagan
 * comisión. Acá cada línea se mide contra SUS propios ingresos, así que el 40/3/57 del lavado se
 * lee fiel sin importar cuánto se venda en la nevera.
 *
 * `utilidadNeta` es exactamente la misma cifra que `totales.utilidadNeta`: los cuatro cubos de
 * gasto suman `totales.gastos`, así que esto solo redistribuye renglones, no cambia el resultado.
 */
export function resultadoPorLinea(t: RentabilidadTotales): ResultadoPorLinea {
  const lavadero = {
    ...linea(t.ingresosLavadero, t.comisionLavadores + t.comisionJefeZona, t.gastosLavadero),
    comisionLavadores: t.comisionLavadores,
    comisionJefeZona: t.comisionJefeZona,
    descuentos: t.descuentos,
  }

  // Los gastos de la línea de productos no se subdividen por sección: una categoría se taguea a
  // "productos", no a "bebidas". Se muestran a nivel de línea y las secciones quedan a margen
  // bruto (ingresos − costo), que es la comparación que interesa entre nevera y vitrina.
  const porSeccion: SeccionResultado[] = [
    { seccion: 'bebida' as const, label: 'Bebidas', ing: t.ingresosBebidas, costo: t.costoBebidas },
    { seccion: 'snack' as const, label: 'Snacks', ing: t.ingresosSnacks, costo: t.costoSnacks },
    { seccion: 'sin_seccion' as const, label: 'Sin sección', ing: t.ingresosSinSeccion, costo: t.costoSinSeccion },
  ]
    .filter((s) => s.ing !== 0 || s.costo !== 0)
    .map((s) => ({ seccion: s.seccion, label: s.label, ...linea(s.ing, s.costo, 0) }))

  const productos = {
    ...linea(t.ingresosVentas, t.costoMercancia, t.gastosProductos),
    costoMercancia: t.costoMercancia,
    porSeccion,
  }

  const parqueadero = linea(t.ingresosParqueadero, 0, t.gastosParqueadero)

  const margenBrutoTotal = lavadero.utilidad + productos.utilidad + parqueadero.utilidad
  return {
    lavadero,
    productos,
    parqueadero,
    gastosGenerales: t.gastosGenerales,
    margenBrutoTotal,
    utilidadNeta: margenBrutoTotal - t.gastosGenerales,
    ingresosTotales: t.ingresosLavadero + t.ingresosParqueadero + t.ingresosVentas,
  }
}

// "Lavar entre 2": la comisión total de la orden se parte 50/50; el principal se lleva el redondeo
// hacia arriba (mismo criterio que src/data/liquidaciones.ts, para que las dos mitades sumen
// siempre `comisionLavador`).
function comisionParaLavador(orden: Orden, lavadorId: string): number {
  if (!orden.lavadorId2) return orden.comisionLavador
  const mitadPrincipal = Math.ceil(orden.comisionLavador / 2)
  return orden.lavadorId === lavadorId ? mitadPrincipal : orden.comisionLavador - mitadPrincipal
}

// Convierte [periodoInicio, periodoFin] (fechas YYYY-MM-DD locales, ambas inclusivas) en el par
// de timestamps ISO [desde, hasta) usando medianoche LOCAL (no UTC), para que el bucket por día
// calendario coincida con lo que ve el usuario en Colombia.
function limitesISO(periodoInicio: string, periodoFin: string): [string, string] {
  const [ay, am, ad] = periodoInicio.split('-').map(Number)
  const [by, bm, bd] = periodoFin.split('-').map(Number)
  return [new Date(ay, am - 1, ad).toISOString(), new Date(by, bm - 1, bd + 1).toISOString()]
}

interface DatosRango {
  ordenes: Orden[]
  salidasParqueadero: { cobro: number; horaSalida: string }[]
  ventasActivas: Awaited<ReturnType<typeof fetchVentasEnRango>>
  costoPorVenta: Awaited<ReturnType<typeof fetchCostoMercanciaVendidaPorVenta>>
  gastos: GastoConCategoria[]
  productos: Awaited<ReturnType<typeof fetchProductos>>
}

async function cargarDatosRango(periodoInicio: string, periodoFin: string): Promise<DatosRango> {
  const [desdeISO, hastaISO] = limitesISO(periodoInicio, periodoFin)
  // `fetchProductos` entra al núcleo (antes solo lo pedía el reporte completo) porque el desglose
  // bebidas/snacks necesita `producto.seccion` también en la serie por día del dashboard.
  const [ordenes, salidasParqueadero, ventas, gastos, productos] = await Promise.all([
    fetchOrdenesEntregadasEnRango(desdeISO, hastaISO),
    fetchSalidasParqueaderoEnRango(desdeISO, hastaISO),
    fetchVentasEnRango(desdeISO, hastaISO),
    fetchGastos(periodoInicio, periodoFin),
    fetchProductos(),
  ])
  const ventasActivas = ventas.filter((v) => v.estado === 'activa')
  const costoPorVenta = await fetchCostoMercanciaVendidaPorVenta(ventasActivas.map((v) => v.id))
  return { ordenes, salidasParqueadero, ventasActivas, costoPorVenta, gastos, productos }
}

function agregarPorDia(datos: DatosRango): RentabilidadPeriodo {
  const dias = new Map<string, RentabilidadDia>()
  const dia = (fecha: string) => {
    let d = dias.get(fecha)
    if (!d) {
      d = diaVacio(fecha)
      dias.set(fecha, d)
    }
    return d
  }

  for (const orden of datos.ordenes) {
    if (orden.estado === 'anulada' || !orden.entregadaEn) continue
    const d = dia(fechaLocalISO(new Date(orden.entregadaEn)))
    d.ingresosLavadero += orden.precio - orden.descuento
    d.descuentos += orden.descuento
    d.comisionLavadores += orden.comisionLavador
    d.comisionJefeZona += orden.comisionJefeZona
  }
  for (const salida of datos.salidasParqueadero) {
    dia(fechaLocalISO(new Date(salida.horaSalida))).ingresosParqueadero += salida.cobro
  }
  const seccionDe = new Map(datos.productos.map((p) => [p.id, p.seccion] as const))
  for (const venta of datos.ventasActivas) {
    const d = dia(fechaLocalISO(new Date(venta.creadoEn)))
    d.ingresosVentas += venta.total
    const costo = datos.costoPorVenta.get(venta.id)
    const costoVenta = costo?.tieneCosto ? costo.costo : 0
    if (costo?.tieneCosto) d.costoMercancia += costoVenta
    else d.ventasSinCosto += 1
    // Un producto vendible sin sección cae en "sin sección" en vez de desaparecer del desglose:
    // así bebidas + snacks + sin sección siempre reconstruyen el total de la línea.
    const seccion = seccionDe.get(venta.productoId)
    if (seccion === 'bebida') {
      d.ingresosBebidas += venta.total
      d.costoBebidas += costoVenta
    } else if (seccion === 'snack') {
      d.ingresosSnacks += venta.total
      d.costoSnacks += costoVenta
    } else {
      d.ingresosSinSeccion += venta.total
      d.costoSinSeccion += costoVenta
    }
  }
  for (const gasto of datos.gastos) {
    const d = dia(gasto.fecha)
    d.gastos += gasto.monto
    // Reparto por línea (0059). Sin línea = general: se resta del consolidado, no de una línea.
    d[bucketGasto(gasto)] += gasto.monto
  }

  const porDia = Array.from(dias.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const d of porDia) recalcular(d)

  const totales: RentabilidadTotales = totalesVacio()
  for (const d of porDia) acumularTotales(totales, d)
  recalcular(totales)
  return { porDia, totales }
}

// Núcleo — devuelve la cascada por día + totales. Se mantiene exportado porque es lo mínimo que
// necesita cualquier consumidor que solo quiera "cuánto se ganó en este rango".
export async function fetchRentabilidadEnRango(
  periodoInicio: string,
  periodoFin: string,
): Promise<RentabilidadPeriodo> {
  return agregarPorDia(await cargarDatosRango(periodoInicio, periodoFin))
}

// Rango de igual longitud inmediatamente anterior a [periodoInicio, periodoFin].
function rangoAnterior(periodoInicio: string, periodoFin: string): [string, string] {
  const [ay, am, ad] = periodoInicio.split('-').map(Number)
  const [by, bm, bd] = periodoFin.split('-').map(Number)
  const inicio = new Date(ay, am - 1, ad)
  const fin = new Date(by, bm - 1, bd)
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000) + 1
  const nuevoFin = new Date(inicio)
  nuevoFin.setDate(nuevoFin.getDate() - 1)
  const nuevoInicio = new Date(nuevoFin)
  nuevoInicio.setDate(nuevoInicio.getDate() - (dias - 1))
  return [fechaLocalISO(nuevoInicio), fechaLocalISO(nuevoFin)]
}

// Reporte completo para el panel de /admin/rentabilidad.
export async function fetchRentabilidad(
  periodoInicio: string,
  periodoFin: string,
): Promise<RentabilidadReporte> {
  const [anteriorInicio, anteriorFin] = rangoAnterior(periodoInicio, periodoFin)
  const [datos, previo, combos, lavadores, tipos] = await Promise.all([
    cargarDatosRango(periodoInicio, periodoFin),
    fetchRentabilidadEnRango(anteriorInicio, anteriorFin),
    fetchCombos(),
    fetchLavadores(),
    fetchTiposVehiculo(),
  ])
  // `cargarDatosRango` ya trae el catálogo de productos (lo necesita para el desglose por sección);
  // no se vuelve a pedir acá.
  const productos = datos.productos

  const base = agregarPorDia(datos)
  const entregadas = datos.ordenes.filter((o) => o.estado !== 'anulada' && o.entregadaEn)

  const comboNombre = new Map(combos.map((c) => [c.id, c.nombre] as const))
  const comboCategoria = new Map(combos.map((c) => [c.id, c.categoria] as const))
  const lavadorNombre = new Map(lavadores.map((l) => [l.id, l.nombre] as const))
  const tipoNombre = new Map(tipos.map((t) => [t.id, t.nombre] as const))
  const productoInfo = new Map(productos.map((p) => [p.id, p] as const))

  // --- por lavador ---
  const porLavadorMap = new Map<string, LavadorRentabilidad>()
  const acumLavador = (id: string) => {
    let v = porLavadorMap.get(id)
    if (!v) {
      v = {
        lavadorId: id,
        nombre: lavadorNombre.get(id) ?? '—',
        ordenes: 0,
        ingresoLista: 0,
        descuento: 0,
        comision: 0,
        pctComisionDelTotal: 0,
      }
      porLavadorMap.set(id, v)
    }
    return v
  }
  for (const o of entregadas) {
    for (const lid of [o.lavadorId, o.lavadorId2]) {
      if (!lid) continue
      const v = acumLavador(lid)
      v.ordenes += 1
      v.ingresoLista += o.precio
      v.descuento += o.descuento
      v.comision += comisionParaLavador(o, lid)
    }
  }
  const totalComisionLav = base.totales.comisionLavadores
  const porLavador = Array.from(porLavadorMap.values())
    .map((v) => ({ ...v, pctComisionDelTotal: totalComisionLav > 0 ? (v.comision / totalComisionLav) * 100 : 0 }))
    .sort((a, b) => b.comision - a.comision)

  // --- por combo ---
  const porComboMap = new Map<string, ComboRentabilidad>()
  for (const o of entregadas) {
    const key = o.comboId ?? 'sin-combo'
    let v = porComboMap.get(key)
    if (!v) {
      v = {
        comboId: key,
        nombre: o.comboId ? (comboNombre.get(o.comboId) ?? 'Combo eliminado') : 'Sin combo',
        categoria: o.comboId ? (comboCategoria.get(o.comboId) ?? '—') : '—',
        cantidad: 0,
        ingreso: 0,
        ticketPromedio: 0,
      }
      porComboMap.set(key, v)
    }
    v.cantidad += 1
    v.ingreso += o.precio - o.descuento
  }
  const porCombo = Array.from(porComboMap.values())
    .map((v) => ({ ...v, ticketPromedio: v.cantidad > 0 ? Math.round(v.ingreso / v.cantidad) : 0 }))
    .sort((a, b) => b.ingreso - a.ingreso)

  // --- gastos por categoría ---
  const gastoCatMap = new Map<string, GastoCategoriaRentabilidad>()
  for (const g of datos.gastos) {
    let v = gastoCatMap.get(g.categoriaId)
    if (!v) {
      v = { categoriaId: g.categoriaId, nombre: g.categoriaNombre, total: 0, cantidad: 0 }
      gastoCatMap.set(g.categoriaId, v)
    }
    v.total += g.monto
    v.cantidad += 1
  }
  const gastosPorCategoria = Array.from(gastoCatMap.values()).sort((a, b) => b.total - a.total)

  // --- productos vendidos ---
  const prodMap = new Map<string, ProductoRentabilidad>()
  for (const venta of datos.ventasActivas) {
    let v = prodMap.get(venta.productoId)
    if (!v) {
      v = {
        productoId: venta.productoId,
        nombre: productoInfo.get(venta.productoId)?.nombre ?? 'Producto eliminado',
        cantidad: 0,
        ingreso: 0,
        costo: 0,
        margen: 0,
      }
      prodMap.set(venta.productoId, v)
    }
    v.cantidad += venta.cantidad
    v.ingreso += venta.total
    const costo = datos.costoPorVenta.get(venta.id)
    if (costo?.tieneCosto) v.costo += costo.costo
  }
  const productosVendidos = Array.from(prodMap.values())
    .map((v) => ({ ...v, margen: v.ingreso - v.costo }))
    .sort((a, b) => b.ingreso - a.ingreso)

  // --- líneas de órdenes para el modal ---
  const ordenesLinea: OrdenRentabilidadLinea[] = entregadas
    .map((o) => ({
      consecutivo: o.consecutivo,
      fecha: o.entregadaEn as string,
      placa: o.placa,
      tipoNombre: tipoNombre.get(o.tipoVehiculoId) ?? '—',
      comboNombre: o.comboId ? (comboNombre.get(o.comboId) ?? 'Combo eliminado') : 'Sin combo',
      lavadorNombre: o.lavadorId
        ? [o.lavadorId, o.lavadorId2]
            .filter(Boolean)
            .map((id) => lavadorNombre.get(id as string) ?? '—')
            .join(' + ')
        : 'Sin asignar',
      precio: o.precio,
      descuento: o.descuento,
      neto: o.precio - o.descuento,
      comisionLavador: o.comisionLavador,
      comisionJefeZona: o.comisionJefeZona,
      metodoPago: o.metodoPago ?? (o.precio - o.descuento === 0 ? 'cortesía' : '—'),
      jefeZonaResponsable: o.jefeZonaResponsable ?? '—',
    }))
    .sort((a, b) => b.consecutivo - a.consecutivo)

  const ventasLinea: VentaRentabilidadLinea[] = datos.ventasActivas
    .map((v) => ({
      fecha: v.creadoEn,
      productoNombre: productoInfo.get(v.productoId)?.nombre ?? 'Producto eliminado',
      cantidad: v.cantidad,
      total: v.total,
    }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha))

  const cantidadLavados = entregadas.length
  const cantidadProductos = datos.ventasActivas.reduce((s, v) => s + v.cantidad, 0)
  const ticketPromedioLavado =
    cantidadLavados > 0 ? Math.round(base.totales.ingresosLavadero / cantidadLavados) : 0

  const diasConDatos = base.porDia
  const diaMasRentable =
    diasConDatos.length > 0 ? diasConDatos.reduce((a, b) => (b.utilidadNeta > a.utilidadNeta ? b : a)) : null
  const diaMenosRentable =
    diasConDatos.length > 0 ? diasConDatos.reduce((a, b) => (b.utilidadNeta < a.utilidadNeta ? b : a)) : null

  return {
    ...base,
    comparativa: previo.totales,
    porLavador,
    porCombo,
    gastosPorCategoria,
    productos: productosVendidos,
    ordenes: ordenesLinea,
    ventas: ventasLinea,
    gastos: datos.gastos,
    cantidadLavados,
    cantidadProductos,
    ticketPromedioLavado,
    diaMasRentable,
    diaMenosRentable,
  }
}
