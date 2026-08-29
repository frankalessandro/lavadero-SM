import { db } from '../lib/db'
import {
  anularVentaInputSchema,
  ventaCarritoInputSchema,
  ventaInputSchema,
  ventaSchema,
  type AnularVentaInput,
  type Venta,
  type VentaCarritoInput,
  type VentaInput,
} from '../schemas/venta'
import type { PagoLineaInput } from '../schemas/pago'

const VENTA_SELECT =
  'id, consecutivo, productoId:producto_id, cantidad, precioUnitario:precio_unitario, total, metodoPago:metodo_pago, referenciaPago:referencia_pago, turnoId:turno_id, ordenId:orden_id, ventaGrupoId:venta_grupo_id, vendidoPor:vendido_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

function inicioDeHoyISO(): string {
  const ahora = new Date()
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
}

export async function fetchVentasHoy(): Promise<Venta[]> {
  const { data, error } = await db
    .from('ventas')
    .select(VENTA_SELECT)
    .gte('creado_en', inicioDeHoyISO())
    .order('consecutivo', { ascending: false })
  if (error) throw new Error(error.message)
  return ventaSchema.array().parse(data)
}

// Productos cargados a órdenes de lavado que todavía no se han cobrado (estado 'pendiente').
// El tablero de seguimiento (jefe de zona) los agrupa por `ordenId` para mostrar el chip de
// "productos" en cada tarjeta y sumarlos al total del cobro. Volumen chico (lo que hay en
// proceso ahora mismo), así que se traen todos y se agrupan en el cliente.
export async function fetchVentasPendientes(): Promise<Venta[]> {
  const { data, error } = await db
    .from('ventas')
    .select(VENTA_SELECT)
    .eq('estado', 'pendiente')
    .order('consecutivo', { ascending: true })
  if (error) throw new Error(error.message)
  return ventaSchema.array().parse(data)
}

// Para reportes de admin (mismo patrón que fetchOrdenesEnRango).
export async function fetchVentasEnRango(desdeISO: string, hastaISO: string): Promise<Venta[]> {
  const { data, error } = await db
    .from('ventas')
    .select(VENTA_SELECT)
    .gte('creado_en', desdeISO)
    .lt('creado_en', hastaISO)
    .order('consecutivo', { ascending: false })
  if (error) throw new Error(error.message)
  return ventaSchema.array().parse(data)
}

// Registro + cobro + descuento de stock en un solo paso — a diferencia de una orden de lavado,
// una venta de producto se cobra en el acto (no hay "entregar después"), así que turno_id se fija
// desde ya, no en un segundo paso.
//
// Va por la RPC `registrar_venta` (0032_venta_atomica_y_costo.sql) y no por dos inserts sueltos:
// la venta y su movimiento de inventario tienen que quedar ambos o ninguno, porque una venta
// cobrada sin descontar stock descuadra el inventario en silencio. Las validaciones de producto
// activo / precio configurado / turno abierto viven dentro de la función (borde de confianza
// real); el `parse` de acá sigue siendo el que da los mensajes de campo en el formulario.
// Con `ordenId`, la RPC crea la venta como `pendiente` (sin turno, sin mover stock) cargada a
// esa orden de lavado; el cobro y el descuento de inventario ocurren después, al entregar el
// vehículo (`cobrar_orden` en src/data/ordenes.ts). Sin `ordenId`, es la venta aparte de
// siempre: cobro en el acto.
export async function createVenta(input: VentaInput): Promise<Venta> {
  const parsed = ventaInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_venta', {
      p_producto_id: parsed.productoId,
      p_cantidad: parsed.cantidad,
      p_metodo_pago: parsed.metodoPago,
      p_referencia_pago: parsed.referenciaPago ?? null,
      p_vendido_por: parsed.vendidoPor,
      p_orden_id: parsed.ordenId,
    })
    .select(VENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ventaSchema.parse(data)
}

// Venta aparte de mostrador: varias líneas de producto cobradas juntas con pago partido (1–3
// métodos que deben sumar el total del carrito). Va por la RPC `registrar_venta_carrito` (0036):
// crea una fila `ventas` + su salida de inventario por ítem y 1–3 filas `pagos` contra un
// `venta_grupo_id` común, todo en una transacción. Devuelve las filas `ventas` creadas.
export async function createVentaCarrito(input: VentaCarritoInput, pagos: PagoLineaInput[]): Promise<Venta[]> {
  const parsed = ventaCarritoInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_venta_carrito', {
      p_items: parsed.items.map((it) => ({ producto_id: it.productoId, cantidad: it.cantidad })),
      p_pagos: pagos.map((l) => ({ metodo: l.metodo, monto: l.monto, referencia: l.referencia ?? null })),
      p_vendido_por: parsed.vendidoPor,
    })
    .select(VENTA_SELECT)
  if (error) throw new Error(error.message)
  return ventaSchema.array().parse(data)
}

// Regla de negocio 13: ningún registro se elimina — se anula con motivo obligatorio. A diferencia
// de anularOrden, acá también hay que reponer el stock (la venta sí descontó inventario real), y
// por eso va igualmente por RPC (`anular_venta`): anular sin reponer deja el stock corto sin que
// nadie se entere. La función además falla si la venta ya estaba anulada, así que un doble clic
// no duplica el reverso.
export async function anularVenta(id: string, input: AnularVentaInput): Promise<Venta> {
  const parsed = anularVentaInputSchema.parse(input)
  const { data, error } = await db
    .rpc('anular_venta', {
      p_venta_id: id,
      p_motivo: parsed.motivo,
      p_anulada_por: parsed.anuladaPor,
    })
    .select(VENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ventaSchema.parse(data)
}

export interface CostoMercanciaVendida {
  costo: number
  // Ventas del conjunto consultado que no tienen costo registrado — o son anteriores a
  // 0032_venta_atomica_y_costo.sql, o el producto nunca tuvo una entrada con costo capturado.
  // Se reporta aparte para que el dashboard pueda decir "esta cifra está incompleta" en vez de
  // presentar un costo bajo como si fuera el real.
  ventasSinCosto: number
}

// Costo de lo vendido = suma del snapshot `costo_unitario` que quedó en el movimiento de salida
// de cada venta. Solo admin: lee `movimientos_inventario` (tabla base, no la vista operativa),
// que por RLS es admin-only — jefe de zona no ve costos (CLAUDE.md §Roles).
export async function fetchCostoMercanciaVendida(ventaIds: string[]): Promise<CostoMercanciaVendida> {
  if (ventaIds.length === 0) return { costo: 0, ventasSinCosto: 0 }
  const { data, error } = await db
    .from('movimientos_inventario')
    .select('venta_id, cantidad, costo_unitario')
    .eq('tipo', 'salida')
    .in('venta_id', ventaIds)
  if (error) throw new Error(error.message)

  const salidas = (data ?? []) as { venta_id: string; cantidad: number; costo_unitario: number | null }[]
  const conCosto = new Set<string>()
  let costo = 0
  for (const salida of salidas) {
    if (salida.costo_unitario == null || salida.costo_unitario === 0) continue
    // `cantidad` viene negativa (es una salida) — el costo es un valor positivo.
    costo += Math.abs(salida.cantidad) * salida.costo_unitario
    conCosto.add(salida.venta_id)
  }
  return { costo, ventasSinCosto: ventaIds.length - conCosto.size }
}
