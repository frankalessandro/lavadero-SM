import { fetchProductos, fetchProductosOperativo } from './productos'
import { fetchStockProductos, fetchStockProductosOperativo } from './movimientosInventario'
import { fetchFaltantesPendientes } from './conteosInventario'
import { fetchConsecutivosEnRango } from './ordenes'
import { fetchSuscripciones } from './suscripcionesParqueadero'
import { fetchCorreccionesEnRango } from './pagos'
import { nivelStock } from '../lib/nivelStock'
import { huecosEntre } from '../lib/consecutivo'
import { estadoVigencia } from '../schemas/suscripcionParqueadero'

// Centro de notificaciones (ver src/components/layout/NotificacionesCentro.tsx) — no hay tabla
// de "notificaciones" nueva ni migración: cada alerta es una relectura de datos que ya existen y
// ya tienen su propia pantalla (Inventario, Órdenes, Parqueadero, Turnos). Esto solo las agrega
// en un solo lugar para que no haya que entrar a varias pantallas a buscar qué necesita atención
// hoy.
//
// Dos funciones, no una con un parámetro de rol: lo que jefe de patio puede ver NO es un
// subconjunto elegido a mano de lo que ve admin — está limitado por RLS. `conteos_inventario_lineas`
// (faltantes) es admin-only porque lleva `valorDiferencia` a costo (dato sensible, ver §Roles);
// `suscripciones_parqueadero` tampoco le da SELECT a jefe_zona (admin CRUD, vigilante SELECT). Si
// `fetchAlertasJefeZona` llamara los mismos fetchers que admin, esas dos consultas devolverían
// vacío (o error) en vez de simplemente no existir para ese rol — más limpio no llamarlas.

export interface Alerta {
  id: string
  titulo: string
  detalle: string
  ruta: string
}

function hace7DiasISO(): { desdeISO: string; hastaISO: string } {
  const ahora = new Date()
  const desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 6)
  const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1)
  return { desdeISO: desde.toISOString(), hastaISO: hasta.toISOString() }
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function alertaStockBajo(bajos: { nombre: string }[], ruta: string): Alerta | null {
  if (bajos.length === 0) return null
  return {
    id: 'stock-bajo',
    titulo: `${bajos.length} producto${bajos.length === 1 ? '' : 's'} en stock bajo`,
    detalle: bajos.map((p) => p.nombre).slice(0, 4).join(', ') + (bajos.length > 4 ? '…' : ''),
    ruta,
  }
}

function alertaHuecosConsecutivo(consecutivos: number[], ruta: string): Alerta | null {
  const huecos = huecosEntre(consecutivos)
  if (huecos.length === 0) return null
  return {
    id: 'huecos-consecutivo',
    titulo: `${huecos.length} hueco${huecos.length === 1 ? '' : 's'} en el consecutivo (7 días)`,
    detalle: 'Un tiquete que nunca se confirmó.',
    ruta,
  }
}

export async function fetchAlertas(): Promise<Alerta[]> {
  const { desdeISO, hastaISO } = hace7DiasISO()

  const [productos, stock, faltantes, consecutivos, suscripciones, correcciones] = await Promise.all([
    fetchProductos(),
    fetchStockProductos(),
    fetchFaltantesPendientes(),
    fetchConsecutivosEnRango(desdeISO, hastaISO),
    fetchSuscripciones(),
    fetchCorreccionesEnRango(desdeISO, hastaISO),
  ])

  const stockPorProducto = new Map(stock.map((s) => [s.productoId, s.stock]))
  const bajos = productos.filter((p) => p.activo && nivelStock(stockPorProducto.get(p.id) ?? 0) === 'bajo')

  const alertas: Alerta[] = []

  const stockBajo = alertaStockBajo(bajos, '/admin/dinero/inventario')
  if (stockBajo) alertas.push(stockBajo)

  const huecosAlerta = alertaHuecosConsecutivo(consecutivos, '/admin/operacion/ordenes')
  if (huecosAlerta) alertas.push(huecosAlerta)

  if (faltantes.length > 0) {
    const valorTotal = faltantes.reduce((s, f) => s + (f.linea.valorDiferencia ?? 0), 0)
    alertas.push({
      id: 'faltantes-inventario',
      titulo: `${faltantes.length} faltante${faltantes.length === 1 ? '' : 's'} de inventario sin revisar`,
      detalle: valorTotal > 0 ? `Valorado en ${COP.format(valorTotal)}` : 'Pendientes de resolución',
      ruta: '/admin/dinero/inventario',
    })
  }

  const porVencer = suscripciones.filter((s) => s.activo && estadoVigencia(s.fechaFin) === 'por_vencer')
  if (porVencer.length > 0) {
    alertas.push({
      id: 'suscripciones-por-vencer',
      titulo: `${porVencer.length} suscripción${porVencer.length === 1 ? '' : 'es'} de parqueadero por vencer`,
      detalle: porVencer.map((s) => s.placa).slice(0, 4).join(', ') + (porVencer.length > 4 ? '…' : ''),
      ruta: '/admin/catalogo/parqueadero',
    })
  }

  if (correcciones.length > 0) {
    alertas.push({
      id: 'correcciones-pago',
      titulo: `${correcciones.length} corrección${correcciones.length === 1 ? '' : 'es'} de reparto de pago (7 días)`,
      detalle: 'Cambios al método/monto de un cobro ya hecho — revisar en Operación › Turnos.',
      ruta: '/admin/operacion/turnos',
    })
  }

  return alertas
}

// Jefe de patio: sobre todo stock (pedido explícito) — la vista operativa (`*Operativo`, sin
// costo) del mismo catálogo que usa /jefe-zona/inventario — más huecos de consecutivo, que
// también puede ver (sus propias órdenes). Sin faltantes de conteo ni suscripciones de
// parqueadero: ninguna de las dos tiene RLS para este rol (ver comentario de arriba).
export async function fetchAlertasJefeZona(): Promise<Alerta[]> {
  const { desdeISO, hastaISO } = hace7DiasISO()

  const [productos, stock, consecutivos] = await Promise.all([
    fetchProductosOperativo(),
    fetchStockProductosOperativo(),
    fetchConsecutivosEnRango(desdeISO, hastaISO),
  ])

  const stockPorProducto = new Map(stock.map((s) => [s.productoId, s.stock]))
  const bajos = productos.filter((p) => p.activo && nivelStock(stockPorProducto.get(p.id) ?? 0) === 'bajo')

  const alertas: Alerta[] = []

  const stockBajo = alertaStockBajo(bajos, '/jefe-zona/inventario')
  if (stockBajo) alertas.push(stockBajo)

  const huecosAlerta = alertaHuecosConsecutivo(consecutivos, '/jefe-zona')
  if (huecosAlerta) alertas.push(huecosAlerta)

  return alertas
}
