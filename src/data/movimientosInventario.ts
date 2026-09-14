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

const MOVIMIENTO_OPERATIVO_SELECT = 'id, productoId:producto_id, tipo, cantidad, motivo, responsable, creadoEn:creado_en'

// Para jefe_zona: lee movimientos_inventario_operativo (vista sin costo_unitario/proveedor,
// ver 0012_rls_policies.sql) en vez de la tabla base — RLS bloquea a jefe_zona en la tabla real.
export async function fetchMovimientosOperativo(productoId?: string): Promise<MovimientoInventario[]> {
  let query = db.from('movimientos_inventario_operativo').select(MOVIMIENTO_OPERATIVO_SELECT).order('creado_en', { ascending: false })
  if (productoId) query = query.eq('producto_id', productoId)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return movimientoInventarioSchema.array().parse(data)
}

// Para jefe_zona: RLS bloquea INSERT directo sobre movimientos_inventario (0012_rls_policies.sql
// — solo admin), así que registra el movimiento a través de la vista operativa (mismo trigger
// INSTEAD OF que ya usa fetchMovimientosOperativo para leer). Sin costo_unitario/proveedor porque
// esas columnas no existen en la vista — jefe_zona no ve costos (CLAUDE.md §Roles); una entrada
// registrada así queda sin costo, igual que hoy pasa con cualquier entrada sin costo capturado.
//
// No hace `.select()` de vuelta: en una vista con trigger `INSTEAD OF INSERT`, el `RETURNING`
// entrega el `NEW` del trigger, que no trae `id` ni `creado_en` (se generan en la tabla base),
// así que parsearlo reventaba con `invalid_type` en esos dos campos aunque la fila SÍ se
// insertaba. El llamador descarta el resultado y refresca la lista, así que no se pierde nada.
export async function createMovimientoOperativo(input: MovimientoInventarioInput): Promise<void> {
  const parsed = movimientoInventarioInputSchema.parse(input)
  const { error } = await db.from('movimientos_inventario_operativo').insert({
    producto_id: parsed.productoId,
    tipo: parsed.tipo,
    cantidad: parsed.cantidad,
    motivo: parsed.motivo,
    responsable: parsed.responsable,
  })
  if (error) throw new Error(error.message)
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

// `stock` = lo que dice el sistema (Σ movimientos). `comprometido` = unidades cargadas a órdenes
// o cuentas sin cobrar (ya salieron de la nevera, el stock aún no las descontó). `disponible` =
// stock − comprometido: lo que se puede vender o cargar. Las pantallas de VENTA usan `disponible`;
// las de INVENTARIO/conteo usan `stock`.
export interface StockOperativo {
  productoId: string
  stock: number
  comprometido: number
  disponible: number
}

export interface StockProducto extends StockOperativo {
  costoPromedio: number
  valorizacion: number
}

// Se agrega en SQL (RPC `stock_productos`, 0060), no en el navegador: bajar todos los
// movimientos chocaba con el tope de 1000 filas de PostgREST. Costo promedio con el mismo
// fallback a `productos.costo` que usa el snapshot de costo de las ventas. Solo admin.
export async function fetchStockProductos(): Promise<StockProducto[]> {
  const { data, error } = await db.rpc('stock_productos')
  if (error) throw new Error(error.message)
  return (
    data as {
      producto_id: string
      stock: number
      comprometido: number
      disponible: number
      costo_promedio: number
      valorizacion: number
    }[]
  ).map((r) => ({
    productoId: r.producto_id,
    stock: r.stock,
    comprometido: r.comprometido,
    disponible: r.disponible,
    costoPromedio: r.costo_promedio,
    valorizacion: r.valorizacion,
  }))
}

// Para jefe_zona: mismas cantidades, sin costo/valorización (CLAUDE.md §Roles).
export async function fetchStockProductosOperativo(): Promise<StockOperativo[]> {
  const { data, error } = await db.rpc('stock_productos_operativo')
  if (error) throw new Error(error.message)
  return (data as { producto_id: string; stock: number; comprometido: number; disponible: number }[]).map((r) => ({
    productoId: r.producto_id,
    stock: r.stock,
    comprometido: r.comprometido,
    disponible: r.disponible,
  }))
}
