import { db } from '../lib/db'
import {
  movimientoInventarioInputSchema,
  movimientoInventarioSchema,
  type MovimientoInventario,
  type MovimientoInventarioInput,
} from '../schemas/movimientoInventario'

const MOVIMIENTO_SELECT =
  'id, productoId:producto_id, tipo, cantidad, costoUnitario:costo_unitario, proveedor, motivo, responsable, creadoEn:creado_en'

export async function fetchMovimientos(productoId?: string): Promise<MovimientoInventario[]> {
  let query = db.from('movimientos_inventario').select(MOVIMIENTO_SELECT).order('creado_en', { ascending: false })
  if (productoId) query = query.eq('producto_id', productoId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return movimientoInventarioSchema.array().parse(data)
}

export async function createMovimiento(input: MovimientoInventarioInput): Promise<MovimientoInventario> {
  const parsed = movimientoInventarioInputSchema.parse(input)
  const { data, error } = await db
    .from('movimientos_inventario')
    .insert({
      producto_id: parsed.productoId,
      tipo: parsed.tipo,
      cantidad: parsed.cantidad,
      costo_unitario: parsed.costoUnitario,
      proveedor: parsed.proveedor,
      motivo: parsed.motivo,
      responsable: parsed.responsable,
    })
    .select(MOVIMIENTO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return movimientoInventarioSchema.parse(data)
}

export interface StockProducto {
  productoId: string
  stock: number
  costoPromedio: number
  valorizacion: number
}

// Stock = suma de `cantidad` (con signo) de todos los movimientos del producto. Valorización
// usa costo promedio ponderado de las entradas (no hay tabla de "costo actual" aparte, se
// deriva del histórico) — no agrega en SQL, trae todo y suma en JS (mismo patrón que
// `fetchTotalGastosPorCategoria`, suficiente para el volumen esperado).
export async function fetchStockProductos(): Promise<StockProducto[]> {
  const { data, error } = await db
    .from('movimientos_inventario')
    .select('producto_id, tipo, cantidad, costo_unitario')
  if (error) throw new Error(error.message)

  const acumulado = new Map<string, { stock: number; costoTotalEntradas: number; cantidadEntradas: number }>()
  for (const m of data as { producto_id: string; tipo: string; cantidad: number; costo_unitario: number | null }[]) {
    const actual = acumulado.get(m.producto_id) ?? { stock: 0, costoTotalEntradas: 0, cantidadEntradas: 0 }
    actual.stock += m.cantidad
    if (m.tipo === 'entrada' && m.costo_unitario != null) {
      actual.costoTotalEntradas += m.cantidad * m.costo_unitario
      actual.cantidadEntradas += m.cantidad
    }
    acumulado.set(m.producto_id, actual)
  }

  return Array.from(acumulado.entries()).map(([productoId, v]) => {
    const costoPromedio = v.cantidadEntradas > 0 ? v.costoTotalEntradas / v.cantidadEntradas : 0
    return {
      productoId,
      stock: v.stock,
      costoPromedio,
      valorizacion: Math.round(v.stock * costoPromedio),
    }
  })
}
