import { db } from '../lib/db'
import { anularVentaInputSchema, ventaInputSchema, ventaSchema, type AnularVentaInput, type Venta, type VentaInput } from '../schemas/venta'
import { fetchTurnoAbierto } from './turnos'

const VENTA_SELECT =
  'id, consecutivo, productoId:producto_id, cantidad, precioUnitario:precio_unitario, total, metodoPago:metodo_pago, referenciaPago:referencia_pago, turnoId:turno_id, vendidoPor:vendido_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en'

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

// Registro + cobro en un solo paso — a diferencia de una orden de lavado, una venta de producto
// se cobra en el acto (no hay "entregar después"), así que turno_id se fija desde ya, no en un
// segundo paso.
export async function createVenta(input: VentaInput): Promise<Venta> {
  const parsed = ventaInputSchema.parse(input)
  const [turno, productoRes] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    db.from('productos').select('precioVenta:precio_venta, activo').eq('id', parsed.productoId).single(),
  ])
  if (!turno) {
    throw new Error('No hay turno de caja abierto — ábrelo antes de registrar ventas.')
  }
  if (productoRes.error) throw new Error(productoRes.error.message)
  const producto = productoRes.data as { precioVenta: number | null; activo: boolean }
  if (!producto.activo) {
    throw new Error('Este producto está inactivo — actívalo desde /admin/inventario antes de venderlo.')
  }
  if (producto.precioVenta == null) {
    throw new Error('Este producto no tiene precio de venta configurado — defínelo desde /admin/inventario.')
  }

  const total = producto.precioVenta * parsed.cantidad

  const { data, error } = await db
    .from('ventas')
    .insert({
      producto_id: parsed.productoId,
      cantidad: parsed.cantidad,
      precio_unitario: producto.precioVenta,
      total,
      metodo_pago: parsed.metodoPago,
      referencia_pago: parsed.referenciaPago,
      turno_id: turno.id,
      vendido_por: parsed.vendidoPor,
    })
    .select(VENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)

  const venta = ventaSchema.parse(data)

  // No atómico (mismo criterio ya documentado en createOrden/generarLiquidacion): si esto falla,
  // la venta ya quedó cobrada pero el stock no bajó — error explícito con el consecutivo para
  // revisión manual, en vez de fallar en silencio.
  const { error: errorMovimiento } = await db
    .from('movimientos_inventario_operativo')
    .insert({ producto_id: parsed.productoId, tipo: 'salida', cantidad: -parsed.cantidad, motivo: `Venta #${venta.consecutivo}`, responsable: parsed.vendidoPor, venta_id: venta.id })
  if (errorMovimiento) {
    throw new Error(
      `La venta #${venta.consecutivo} se registró por $${total} pero no se pudo descontar del inventario: ${errorMovimiento.message}. Revisar manualmente.`,
    )
  }

  return venta
}

// Regla de negocio 13: ningún registro se elimina — se anula con motivo obligatorio. A diferencia
// de anularOrden, acá también hay que reponer el stock (la venta sí descontó inventario real),
// con un movimiento de entrada compensatorio enlazado por venta_id.
export async function anularVenta(id: string, input: AnularVentaInput): Promise<Venta> {
  const parsed = anularVentaInputSchema.parse(input)
  const { data, error } = await db
    .from('ventas')
    .update({
      estado: 'anulada',
      motivo_anulacion: parsed.motivo,
      anulada_por: parsed.anuladaPor,
      anulada_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select(VENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)

  const venta = ventaSchema.parse(data)

  const { error: errorMovimiento } = await db.from('movimientos_inventario_operativo').insert({
    producto_id: venta.productoId,
    tipo: 'entrada',
    cantidad: venta.cantidad,
    motivo: `Reverso por anulación de venta #${venta.consecutivo}`,
    responsable: parsed.anuladaPor,
    venta_id: venta.id,
  })
  if (errorMovimiento) {
    throw new Error(
      `La venta #${venta.consecutivo} se anuló pero no se pudo reponer el stock: ${errorMovimiento.message}. Revisar manualmente.`,
    )
  }

  return venta
}
