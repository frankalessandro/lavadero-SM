import { z } from 'zod'
import { db } from '../lib/db'
import {
  movimientoInventarioInputSchema,
  movimientoInventarioSchema,
  tipoMovimientoInventarioSchema,
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

// Movimiento manual (entrada/salida/ajuste que no es venta, compra ni conteo). Desde 0069 solo por
// RPC — ni jefe de zona ni admin escriben la tabla directo: la base exige justificación, valida el
// signo, fija la fecha y el responsable (el del turno abierto para jefe de zona). Costo y proveedor
// solo los acepta para admin; jefe de zona no ve costos (CLAUDE.md §Roles).
export async function registrarMovimientoManual(input: MovimientoInventarioInput): Promise<void> {
  const parsed = movimientoInventarioInputSchema.parse(input)
  const { error } = await db.rpc('registrar_movimiento_inventario', {
    p_producto_id: parsed.productoId,
    p_tipo: parsed.tipo,
    p_cantidad: parsed.cantidad,
    p_motivo: parsed.motivo,
    p_costo_unitario: parsed.costoUnitario ?? null,
    p_proveedor: parsed.proveedor ?? null,
  })
  if (error) throw new Error(error.message)
}

export interface MovimientoManual {
  id: string
  productoId: string
  producto: string
  tipo: MovimientoInventario['tipo']
  cantidad: number
  motivo: string | undefined
  responsable: string
  registradoPor: string | undefined
  creadoEn: string
}

// Para gerencia (0069): todo lo que movió stock a mano en el periodo, con justificación, a nombre
// de quién quedó y qué cuenta lo registró. Solo admin.
export async function fetchMovimientosManuales(desde: string): Promise<MovimientoManual[]> {
  const { data, error } = await db.rpc('movimientos_manuales', { p_desde: desde })
  if (error) throw new Error(error.message)
  return (data as Record<string, unknown>[]).map((r) =>
    z
      .object({
        id: z.string(),
        productoId: z.string(),
        producto: z.string(),
        tipo: tipoMovimientoInventarioSchema,
        cantidad: z.number().int(),
        motivo: z.string().nullish().transform((v) => v ?? undefined),
        responsable: z.string(),
        registradoPor: z.string().nullish().transform((v) => v ?? undefined),
        creadoEn: z.string(),
      })
      .parse({
        id: r.id,
        productoId: r.producto_id,
        producto: r.producto,
        tipo: r.tipo,
        cantidad: r.cantidad,
        motivo: r.motivo,
        responsable: r.responsable,
        registradoPor: r.registrado_por,
        creadoEn: r.creado_en,
      }),
  )
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
