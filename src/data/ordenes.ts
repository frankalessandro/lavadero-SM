import { db } from '../lib/db'
import {
  anularOrdenInputSchema,
  clienteInfoInputSchema,
  cobroInputSchema,
  ordenInputSchema,
  ordenSchema,
  type AnularOrdenInput,
  type ClienteInfoInput,
  type CobroInput,
  type Orden,
  type OrdenInput,
} from '../schemas/orden'
import { registrarAsignacion } from './lavadores'
import { fetchConfiguracion } from './configuracion'
import { fetchTurnoAbierto } from './turnos'

const ORDEN_SELECT =
  'id, consecutivo, placa, clienteNombre:cliente_nombre, clienteTelefono:cliente_telefono, clienteCorreo:cliente_correo, tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, lavadorId:lavador_id, precio, comisionLavador:comision_lavador, comisionNegocio:comision_negocio, metodoPago:metodo_pago, referenciaPago:referencia_pago, observaciones, estado, creadoEn:creado_en, listaEn:lista_en, entregadaEn:entregada_en, tiempoLavadoSegundos:tiempo_lavado_segundos, tiempoEsperaEntregaSegundos:tiempo_espera_entrega_segundos, liquidacionId:liquidacion_id, motivoAnulacion:motivo_anulacion, anuladaEn:anulada_en, anuladaPor:anulada_por'

function inicioDeHoyISO(): string {
  const ahora = new Date()
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
}

// Aproximación mientras no existe M5 (turno de caja): "hoy" es el día calendario del cliente,
// no la fecha de apertura del turno nocturno que exige la regla de negocio 11.
export async function fetchOrdenesHoy(): Promise<Orden[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(ORDEN_SELECT)
    .gte('creado_en', inicioDeHoyISO())
    .order('consecutivo', { ascending: false })
  if (error) throw new Error(error.message)
  return ordenSchema.array().parse(data)
}

// Dinero que realmente entró hoy — solo órdenes cobradas/entregadas hoy, no lo registrado hoy.
// Es la fuente correcta para "caja del día" en los dashboards (regla: el ingreso cuenta al
// cobrar, no al recibir el vehículo).
export async function fetchOrdenesEntregadasHoy(): Promise<Orden[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(ORDEN_SELECT)
    .eq('estado', 'entregado')
    .gte('entregada_en', inicioDeHoyISO())
  if (error) throw new Error(error.message)
  return ordenSchema.array().parse(data)
}

// Para reportes (M8/M11): trae órdenes cuya fecha de creación cae en [desdeISO, hastaISO).
export async function fetchOrdenesEnRango(desdeISO: string, hastaISO: string): Promise<Orden[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(ORDEN_SELECT)
    .gte('creado_en', desdeISO)
    .lt('creado_en', hastaISO)
    .order('consecutivo', { ascending: false })
  if (error) throw new Error(error.message)
  return ordenSchema.array().parse(data)
}

export interface HistorialPlaca {
  clienteNombre: string
  clienteTelefono?: string
  clienteCorreo?: string
  tipoVehiculoId: string
  comboId: string
}

export async function buscarPorPlaca(placa: string): Promise<HistorialPlaca | undefined> {
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return undefined

  const { data, error } = await db
    .from('ordenes')
    .select(
      'clienteNombre:cliente_nombre, clienteTelefono:cliente_telefono, clienteCorreo:cliente_correo, tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id',
    )
    .eq('placa', normalizada)
    .order('consecutivo', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return undefined

  return {
    clienteNombre: data.clienteNombre as string,
    clienteTelefono: (data.clienteTelefono as string | null) ?? undefined,
    clienteCorreo: (data.clienteCorreo as string | null) ?? undefined,
    tipoVehiculoId: data.tipoVehiculoId as string,
    comboId: data.comboId as string,
  }
}

async function precioVigente(comboId: string, tipoVehiculoId: string): Promise<number | undefined> {
  const { data, error } = await db
    .from('precios')
    .select('precio')
    .eq('combo_id', comboId)
    .eq('tipo_vehiculo_id', tipoVehiculoId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.precio
}

// Registro de ingreso (M2) — sin cobro todavía. El precio y la comisión quedan fijados desde
// ya (regla de negocio 1), pero el método de pago se captura en `cobrarYEntregarOrden`.
export async function createOrden(input: OrdenInput): Promise<Orden> {
  const parsed = ordenInputSchema.parse(input)
  const [precio, configuracion, turno] = await Promise.all([
    precioVigente(parsed.comboId, parsed.tipoVehiculoId),
    fetchConfiguracion(),
    fetchTurnoAbierto('jefe_zona'),
  ])
  if (!turno) {
    throw new Error('No hay turno de caja abierto — ábrelo antes de registrar vehículos.')
  }
  if (precio === undefined) {
    throw new Error('No existe un precio configurado para ese combo y tipo de vehículo')
  }

  const comisionLavador = Math.round(precio * configuracion.comisionLavadorPorcentaje)
  const comisionNegocio = precio - comisionLavador

  const { data, error } = await db
    .from('ordenes')
    .insert({
      placa: parsed.placa,
      cliente_nombre: parsed.clienteNombre,
      cliente_telefono: parsed.clienteTelefono,
      cliente_correo: parsed.clienteCorreo,
      tipo_vehiculo_id: parsed.tipoVehiculoId,
      combo_id: parsed.comboId,
      lavador_id: parsed.lavadorId,
      precio,
      comision_lavador: comisionLavador,
      comision_negocio: comisionNegocio,
      observaciones: parsed.observaciones,
    })
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)

  await registrarAsignacion(parsed.lavadorId)
  return ordenSchema.parse(data)
}

// M3: el lavador terminó, el vehículo espera en el patio a que el cliente venga a pagar.
// `tiempo_lavado_segundos` queda fijo aquí (creado_en → este momento) como KPI de M10 — no se
// recalcula después, por eso se lee `creado_en` antes del update en vez de restar en el cliente
// (PostgREST no permite expresiones sobre columnas existentes dentro de un update).
export async function marcarListo(id: string): Promise<Orden> {
  const { data: actual, error: errorActual } = await db
    .from('ordenes')
    .select('creadoEn:creado_en')
    .eq('id', id)
    .single()
  if (errorActual) throw new Error(errorActual.message)

  const ahora = new Date()
  const tiempoLavadoSegundos = Math.max(
    0,
    Math.round((ahora.getTime() - new Date(actual.creadoEn as string).getTime()) / 1000),
  )

  const { data, error } = await db
    .from('ordenes')
    .update({
      estado: 'listo',
      lista_en: ahora.toISOString(),
      tiempo_lavado_segundos: tiempoLavadoSegundos,
    })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ordenSchema.parse(data)
}

// M3: reasignar lavador si el asignado se ausenta o queda ocupado a mitad de un lavado. No
// recalcula precio/comisión (dependen del combo, no de quién lo hace) — solo cambia quién lo hace
// y actualiza la cola de rotación a favor del nuevo lavador (regla de negocio 3: un vehículo, un lavador).
export async function reasignarLavador(id: string, nuevoLavadorId: string): Promise<Orden> {
  const { data, error } = await db
    .from('ordenes')
    .update({ lavador_id: nuevoLavadorId })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  await registrarAsignacion(nuevoLavadorId)
  return ordenSchema.parse(data)
}

// Corrige un dato de contacto mal tomado en recepción (nombre/teléfono/correo) mientras el
// vehículo sigue en_proceso o listo — placa/combo/tipo/lavador no se tocan aquí, esos definen
// el servicio ya registrado y cobrado. No hay guarda de estado a nivel de base de datos (mismo
// criterio que reasignarLavador): la UI solo ofrece la acción en esas dos columnas del tablero.
export async function editarInfoCliente(id: string, input: ClienteInfoInput): Promise<Orden> {
  const parsed = clienteInfoInputSchema.parse(input)
  const { data, error } = await db
    .from('ordenes')
    .update({
      cliente_nombre: parsed.clienteNombre,
      cliente_telefono: parsed.clienteTelefono ?? null,
      cliente_correo: parsed.clienteCorreo ?? null,
    })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ordenSchema.parse(data)
}

// Cobro + entrega en un solo paso (M3: nunca se entrega sin cobrar). Aquí es donde el dinero
// entra a caja de verdad — `entregada_en` es lo que cuentan los dashboards, no `creado_en`.
// Se etiqueta con el turno de jefe de zona abierto en ESE momento (regla de negocio 11: el
// movimiento pertenece al turno en que se registró, y el cobro es el movimiento de dinero real
// — no el registro del vehículo, que puede haber pasado en un turno anterior).
export async function cobrarYEntregarOrden(id: string, input: CobroInput): Promise<Orden> {
  const parsed = cobroInputSchema.parse(input)
  const [turno, actual] = await Promise.all([
    fetchTurnoAbierto('jefe_zona'),
    db.from('ordenes').select('listaEn:lista_en, creadoEn:creado_en').eq('id', id).single(),
  ])
  if (actual.error) throw new Error(actual.error.message)

  const ahora = new Date()
  // Cuánto se demoró el cliente en reclamar el vehículo ya lavado (KPI de M10). Si por lo que
  // sea no hay lista_en (no debería pasar en el flujo normal, siempre pasa por marcarListo
  // antes de cobrar), se usa creado_en para no dejar la columna vacía.
  const desde = (actual.data.listaEn as string | null) ?? (actual.data.creadoEn as string)
  const tiempoEsperaEntregaSegundos = Math.max(0, Math.round((ahora.getTime() - new Date(desde).getTime()) / 1000))

  const { data, error } = await db
    .from('ordenes')
    .update({
      estado: 'entregado',
      metodo_pago: parsed.metodoPago,
      referencia_pago: parsed.referenciaPago,
      entregada_en: ahora.toISOString(),
      tiempo_espera_entrega_segundos: tiempoEsperaEntregaSegundos,
      turno_id: turno?.id,
    })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ordenSchema.parse(data)
}

// Regla de negocio 13: ningún registro se elimina — se anula con motivo obligatorio y queda
// visible en reportes/auditoría (bitácora simplificada: quién y cuándo, sin sesión real todavía).
export async function anularOrden(id: string, input: AnularOrdenInput): Promise<Orden> {
  const parsed = anularOrdenInputSchema.parse(input)
  const { data, error } = await db
    .from('ordenes')
    .update({
      estado: 'anulada',
      motivo_anulacion: parsed.motivo,
      anulada_por: parsed.anuladaPor,
      anulada_en: new Date().toISOString(),
    })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ordenSchema.parse(data)
}
