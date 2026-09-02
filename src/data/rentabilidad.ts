import { fetchOrdenesEntregadasEnRango } from './ordenes'
import { fetchSalidasParqueaderoEnRango } from './estanciasParqueadero'
import { fetchVentasEnRango, fetchCostoMercanciaVendidaPorVenta } from './ventas'
import { fetchGastos, type GastoConCategoria } from './gastos'
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

function totalesVacio(): RentabilidadTotales {
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
  }
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
}

async function cargarDatosRango(periodoInicio: string, periodoFin: string): Promise<DatosRango> {
  const [desdeISO, hastaISO] = limitesISO(periodoInicio, periodoFin)
  const [ordenes, salidasParqueadero, ventas, gastos] = await Promise.all([
    fetchOrdenesEntregadasEnRango(desdeISO, hastaISO),
    fetchSalidasParqueaderoEnRango(desdeISO, hastaISO),
    fetchVentasEnRango(desdeISO, hastaISO),
    fetchGastos(periodoInicio, periodoFin),
  ])
  const ventasActivas = ventas.filter((v) => v.estado === 'activa')
  const costoPorVenta = await fetchCostoMercanciaVendidaPorVenta(ventasActivas.map((v) => v.id))
  return { ordenes, salidasParqueadero, ventasActivas, costoPorVenta, gastos }
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
  for (const venta of datos.ventasActivas) {
    const d = dia(fechaLocalISO(new Date(venta.creadoEn)))
    d.ingresosVentas += venta.total
    const costo = datos.costoPorVenta.get(venta.id)
    if (costo?.tieneCosto) d.costoMercancia += costo.costo
    else d.ventasSinCosto += 1
  }
  for (const gasto of datos.gastos) {
    dia(gasto.fecha).gastos += gasto.monto
  }

  const porDia = Array.from(dias.values()).sort((a, b) => a.fecha.localeCompare(b.fecha))
  for (const d of porDia) recalcular(d)

  const totales: RentabilidadTotales = totalesVacio()
  for (const d of porDia) {
    totales.ingresosLavadero += d.ingresosLavadero
    totales.ingresosParqueadero += d.ingresosParqueadero
    totales.ingresosVentas += d.ingresosVentas
    totales.descuentos += d.descuentos
    totales.comisionLavadores += d.comisionLavadores
    totales.comisionJefeZona += d.comisionJefeZona
    totales.costoMercancia += d.costoMercancia
    totales.gastos += d.gastos
    totales.ventasSinCosto += d.ventasSinCosto
  }
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
  const [datos, previo, combos, lavadores, tipos, productos] = await Promise.all([
    cargarDatosRango(periodoInicio, periodoFin),
    fetchRentabilidadEnRango(anteriorInicio, anteriorFin),
    fetchCombos(),
    fetchLavadores(),
    fetchTiposVehiculo(),
    fetchProductos(),
  ])

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
