import { fetchProductos } from './productos'
import { fetchStockProductos } from './movimientosInventario'
import { fetchFaltantesPendientes } from './conteosInventario'
import { fetchConsecutivosEnRango } from './ordenes'
import { fetchSuscripciones } from './suscripcionesParqueadero'
import { fetchCorreccionesEnRango } from './pagos'
import { nivelStock } from '../lib/nivelStock'
import { huecosEntre } from '../lib/consecutivo'
import { estadoVigencia } from '../schemas/suscripcionParqueadero'

// Centro de notificaciones de admin (ver src/components/layout/NotificacionesCentro.tsx) — no
// hay tabla de "notificaciones" nueva ni migración: cada alerta es una relectura de datos que ya
// existen y ya tienen su propia pantalla (Inventario, Órdenes, Parqueadero, Turnos). Esto solo
// las agrega en un solo lugar para que no haya que entrar a cinco pantallas a buscar qué necesita
// atención hoy.

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

  const alertas: Alerta[] = []

  const stockPorProducto = new Map(stock.map((s) => [s.productoId, s.stock]))
  const bajos = productos.filter((p) => p.activo && nivelStock(stockPorProducto.get(p.id) ?? 0) === 'bajo')
  if (bajos.length > 0) {
    alertas.push({
      id: 'stock-bajo',
      titulo: `${bajos.length} producto${bajos.length === 1 ? '' : 's'} en stock bajo`,
      detalle: bajos.map((p) => p.nombre).slice(0, 4).join(', ') + (bajos.length > 4 ? '…' : ''),
      ruta: '/admin/dinero/inventario',
    })
  }

  const huecos = huecosEntre(consecutivos)
  if (huecos.length > 0) {
    alertas.push({
      id: 'huecos-consecutivo',
      titulo: `${huecos.length} hueco${huecos.length === 1 ? '' : 's'} en el consecutivo (7 días)`,
      detalle: 'Un tiquete que nunca se confirmó — revisar en Operación › Órdenes.',
      ruta: '/admin/operacion/ordenes',
    })
  }

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
