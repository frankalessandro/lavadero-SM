import { db } from '../lib/db'
import { cuentaSchema, type Cuenta } from '../schemas/cuenta'
import { ventaSchema, type Venta } from '../schemas/venta'
import { pagoSchema, type Pago } from '../schemas/pago'
import { fetchVentasEnRango } from './ventas'
import { fetchLavadores } from './lavadores'
import { fetchPersonasDeudoras } from './perfiles'

const CUENTA_SELECT =
  'id, titular, nota, estado, abiertaPor:abierta_por, abiertaEn:abierta_en, cerradaEn:cerrada_en, cerradaPor:cerrada_por, turnoId:turno_id, aCosto:a_costo, destinatarioId:destinatario_id, motivo, autorizadoPor:autorizado_por, creadoEn:creado_en'

const VENTA_SELECT_DETALLE =
  'id, consecutivo, productoId:producto_id, cantidad, precioUnitario:precio_unitario, total, metodoPago:metodo_pago, referenciaPago:referencia_pago, turnoId:turno_id, ordenId:orden_id, cuentaId:cuenta_id, ventaGrupoId:venta_grupo_id, vendidoPor:vendido_por, estado, motivoAnulacion:motivo_anulacion, anuladaPor:anulada_por, anuladaEn:anulada_en, creadoEn:creado_en, cobradaEn:cobrada_en, aCosto:a_costo, destinatarioId:destinatario_id'

const PAGO_SELECT_DETALLE =
  'id, ordenId:orden_id, ventaGrupoId:venta_grupo_id, cuentaId:cuenta_id, metodoPago:metodo_pago, monto, referenciaPago:referencia_pago, turnoId:turno_id, anulado, esCorreccion:es_correccion, motivoCorreccion:motivo_correccion, corregidoPor:corregido_por, corregidoEn:corregido_en, creadoEn:creado_en'

// Un `in (...)` con cientos de uuids revienta el largo de la URL de PostgREST: se parte en lotes.
const LOTE = 80

function lotes<T>(items: T[]): T[][] {
  const partes: T[][] = []
  for (let i = 0; i < items.length; i += LOTE) partes.push(items.slice(i, i + LOTE))
  return partes
}

export interface OrdenResumen {
  id: string
  consecutivo: number
  placa: string
}

export interface HistorialVentas {
  ventas: Venta[]
  cuentaPorId: Map<string, Cuenta>
  ordenPorId: Map<string, OrdenResumen>
  // cuentaId → nombre de la persona a la que se le cargó (consumo de nevera, 0065/0070/0073).
  cargadaAPorCuenta: Map<string, string>
}

async function fetchCuentasPorIds(ids: string[]): Promise<Cuenta[]> {
  const partes = await Promise.all(
    lotes(ids).map(async (lote) => {
      const { data, error } = await db.from('cuentas').select(CUENTA_SELECT).in('id', lote)
      if (error) throw new Error(error.message)
      return cuentaSchema.array().parse(data)
    }),
  )
  return partes.flat()
}

async function fetchOrdenesResumen(ids: string[]): Promise<OrdenResumen[]> {
  const partes = await Promise.all(
    lotes(ids).map(async (lote) => {
      const { data, error } = await db.from('ordenes').select('id, consecutivo, placa').in('id', lote)
      if (error) throw new Error(error.message)
      return (data ?? []) as OrdenResumen[]
    }),
  )
  return partes.flat()
}

interface ConsumoFila {
  cuenta_id: string
  lavador_id: string | null
  persona_id: string | null
}

async function fetchConsumosDeCuentas(cuentaIds: string[]): Promise<ConsumoFila[]> {
  const partes = await Promise.all(
    lotes(cuentaIds).map(async (lote) => {
      const { data, error } = await db
        .from('deudas_personal')
        .select('cuenta_id, lavador_id, persona_id')
        .eq('tipo', 'consumo')
        .in('cuenta_id', lote)
      if (error) throw new Error(error.message)
      return (data ?? []) as ConsumoFila[]
    }),
  )
  return partes.flat()
}

// Historial de ventas de nevera/vitrina de un rango, con el contexto de cada una: a qué cuenta u
// orden se cargó y, si la cuenta se cargó a un trabajador, a quién. Fechado por `cobrada_en`
// (cuándo entró la plata / se cargó la deuda), igual que rentabilidad. Una venta `pendiente`
// todavía no tiene `cobrada_en`, así que no aparece: sigue siendo cuenta abierta u orden en curso.
export async function fetchHistorialVentas(desdeISO: string, hastaISO: string): Promise<HistorialVentas> {
  const ventas = (await fetchVentasEnRango(desdeISO, hastaISO)).filter((v) => v.estado !== 'pendiente')

  const cuentaIds = [...new Set(ventas.map((v) => v.cuentaId).filter((id): id is string => Boolean(id)))]
  const ordenIds = [...new Set(ventas.map((v) => v.ordenId).filter((id): id is string => Boolean(id)))]

  const [cuentas, ordenes, consumos] = await Promise.all([
    fetchCuentasPorIds(cuentaIds),
    fetchOrdenesResumen(ordenIds),
    fetchConsumosDeCuentas(cuentaIds),
  ])

  // Los nombres son un complemento: si un rol no puede leer perfiles o lavadores, el historial
  // sigue mostrando que se cargó a un trabajador, solo que sin el nombre.
  const nombres = new Map<string, string>()
  const [lavadores, personas] = await Promise.all([
    fetchLavadores().catch(() => []),
    fetchPersonasDeudoras().catch(() => []),
  ])
  for (const l of lavadores) nombres.set(`lavador:${l.id}`, l.nombre)
  for (const p of personas) nombres.set(`persona:${p.id}`, p.nombre ?? 'Trabajador')

  const cargadaAPorCuenta = new Map<string, string>()
  for (const c of consumos) {
    const clave = c.lavador_id ? `lavador:${c.lavador_id}` : `persona:${c.persona_id}`
    cargadaAPorCuenta.set(c.cuenta_id, nombres.get(clave) ?? 'Trabajador')
  }

  return {
    ventas,
    cuentaPorId: new Map(cuentas.map((c) => [c.id, c])),
    ordenPorId: new Map(ordenes.map((o) => [o.id, o])),
    cargadaAPorCuenta,
  }
}

export interface DetalleCuenta {
  cuenta: Cuenta
  // Todos los productos que pasaron por la cuenta, incluidos los quitados (anulados): cada uno con
  // `creadoEn` = cuándo se agregó y `cobradaEn` = cuándo se cobró o se cargó.
  ventas: Venta[]
  pagos: Pago[]
  cargadaA: string | null
}

// Todo lo que pasó con una cuenta abierta a nombre de alguien: quién la abrió y cuándo, cuándo se
// agregó cada producto, y cómo terminó (cobrada, cargada a un trabajador o anulada).
export async function fetchDetalleCuenta(cuenta: Cuenta, cargadaA: string | null): Promise<DetalleCuenta> {
  const [ventasRes, pagosRes] = await Promise.all([
    db.from('ventas').select(VENTA_SELECT_DETALLE).eq('cuenta_id', cuenta.id).order('creado_en', { ascending: true }),
    db.from('pagos').select(PAGO_SELECT_DETALLE).eq('cuenta_id', cuenta.id).eq('anulado', false).order('creado_en'),
  ])
  if (ventasRes.error) throw new Error(ventasRes.error.message)
  if (pagosRes.error) throw new Error(pagosRes.error.message)
  return {
    cuenta,
    ventas: ventaSchema.array().parse(ventasRes.data),
    pagos: pagoSchema.array().parse(pagosRes.data),
    cargadaA,
  }
}
