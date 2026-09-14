import { db } from '../lib/db'
import {
  anularCompraInputSchema,
  compraInputSchema,
  compraSchema,
  type AnularCompraInput,
  type Compra,
  type CompraInput,
} from '../schemas/compra'

const COMPRA_SELECT =
  'id, consecutivo, proveedor, numeroFactura:numero_factura, fecha, origenPago:origen_pago, turnoId:turno_id, total, registradoPor:registrado_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

export async function fetchComprasRecientes(limite = 15): Promise<Compra[]> {
  const { data, error } = await db
    .from('compras')
    .select(COMPRA_SELECT)
    .order('consecutivo', { ascending: false })
    .limit(limite)
  if (error) throw new Error(error.message)
  return compraSchema.array().parse(data)
}

// Para reportes de admin (mismo patrón que fetchOrdenesEnRango/fetchVentasEnRango).
export async function fetchComprasEnRango(desdeISO: string, hastaISO: string): Promise<Compra[]> {
  const { data, error } = await db
    .from('compras')
    .select(COMPRA_SELECT)
    .gte('creado_en', desdeISO)
    .lt('creado_en', hastaISO)
    .order('consecutivo', { ascending: false })
  if (error) throw new Error(error.message)
  return compraSchema.array().parse(data)
}

// Compras cargadas a la caja de un turno — expediente del turno y arqueo (ver turnos.ts).
export async function fetchComprasDeTurno(turnoId: string): Promise<Compra[]> {
  if (!turnoId) return []
  const { data, error } = await db
    .from('compras')
    .select(COMPRA_SELECT)
    .eq('turno_id', turnoId)
    .order('consecutivo', { ascending: true })
  if (error) throw new Error(error.message)
  return compraSchema.array().parse(data)
}

// Registro atómico: la compra + una entrada de inventario CON costo por cada línea, todo en una
// transacción vía la RPC `registrar_compra` (0064) — reemplaza el camino anterior de registrar
// una "entrada" suelta del formulario de movimientos por cada producto (sin nada que agrupara
// "esto fue una sola compra" ni exigiera proveedor/factura), que ya causó un doble registro real
// en producción.
export async function registrarCompra(input: CompraInput): Promise<Compra> {
  const parsed = compraInputSchema.parse(input)
  const { data, error } = await db
    .rpc('registrar_compra', {
      p_proveedor: parsed.proveedor,
      p_numero_factura: parsed.numeroFactura ?? null,
      p_fecha: parsed.fecha,
      p_origen_pago: parsed.origenPago,
      p_turno_id: parsed.turnoId ?? null,
      p_items: parsed.items.map((it) => ({
        producto_id: it.productoId,
        cantidad: it.cantidad,
        costo_unitario: it.costoUnitario,
      })),
      p_registrado_por: parsed.registradoPor,
    })
    .select(COMPRA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return compraSchema.parse(data)
}

// Regla de negocio 13: ningún registro se elimina — se anula con motivo obligatorio. Repone el
// stock con una salida sin costo (no es una venta, no debe mover el costo promedio ponderado).
export async function anularCompra(id: string, input: AnularCompraInput): Promise<Compra> {
  const parsed = anularCompraInputSchema.parse(input)
  const { data, error } = await db
    .rpc('anular_compra', {
      p_compra_id: id,
      p_motivo: parsed.motivo,
      p_anulada_por: parsed.anuladaPor,
    })
    .select(COMPRA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return compraSchema.parse(data)
}
