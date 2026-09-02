import { db } from '../lib/db'
import {
  anularOrdenInputSchema,
  clienteInfoInputSchema,
  ordenInputSchema,
  ordenSchema,
  type AnularOrdenInput,
  type ClienteInfoInput,
  type Orden,
  type OrdenInput,
} from '../schemas/orden'
import type { PagoLineaInput } from '../schemas/pago'
import { registrarAsignacion } from './lavadores'
import { fetchConfiguracion } from './configuracion'
import { fetchTurnoAbierto } from './turnos'

// orden_servicios embebido vía FK de PostgREST (mismo patrón que `categorias_gasto(nombre)`
// en `src/data/gastos.ts`): trae los add-ons de cada orden en la misma consulta.
const ORDEN_SELECT =
  'id, consecutivo, placa, clienteNombre:cliente_nombre, clienteTelefono:cliente_telefono, clienteCorreo:cliente_correo, tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, lavadorId:lavador_id, lavadorId2:lavador_id_2, precio, descuento, descuentoPct:descuento_pct, descuentoMotivo:descuento_motivo, descuentoAutorizadoPor:descuento_autorizado_por, altoCilindraje:alto_cilindraje, comisionLavador:comision_lavador, comisionJefeZona:comision_jefe_zona, jefeZonaResponsable:jefe_zona_responsable, comisionNegocio:comision_negocio, metodoPago:metodo_pago, referenciaPago:referencia_pago, observaciones, estado, creadoEn:creado_en, listaEn:lista_en, entregadaEn:entregada_en, tiempoLavadoSegundos:tiempo_lavado_segundos, tiempoEsperaEntregaSegundos:tiempo_espera_entrega_segundos, notificadoListo:notificado_listo, liquidacionId:liquidacion_id, liquidacionId2:liquidacion_id_2, liquidacionJefeZonaId:liquidacion_jefe_zona_id, motivoAnulacion:motivo_anulacion, anuladaEn:anulada_en, anuladaPor:anulada_por, serviciosAdicionales:orden_servicios(servicioId:servicio_id, precio, servicios(nombre))'

interface OrdenServicioAdicionalRaw {
  servicioId: string
  precio: number
  servicios: { nombre: string } | null
}

// Aplana el embed (`servicios: {nombre}` anidado) a la forma plana que espera `ordenSchema` —
// centralizado acá para que ningún call site tenga que conocer la forma cruda de PostgREST.
function mapOrdenRow(row: Record<string, unknown> & { serviciosAdicionales?: OrdenServicioAdicionalRaw[] }): Orden {
  const { serviciosAdicionales, ...rest } = row
  return ordenSchema.parse({
    ...rest,
    serviciosAdicionales: (serviciosAdicionales ?? []).map((s) => ({
      servicioId: s.servicioId,
      nombre: s.servicios?.nombre ?? '',
      precio: s.precio,
    })),
  })
}

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
  return (data as Record<string, unknown>[]).map(mapOrdenRow)
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
  return (data as Record<string, unknown>[]).map(mapOrdenRow)
}

// Como fetchOrdenesEntregadasHoy pero para un rango arbitrario — filtra por `entregada_en`
// (cuándo entró la plata), no por `creado_en`. Fuente de "ingresos del lavadero" en el histórico
// de rentabilidad (/admin/rentabilidad).
export async function fetchOrdenesEntregadasEnRango(desdeISO: string, hastaISO: string): Promise<Orden[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(ORDEN_SELECT)
    .eq('estado', 'entregado')
    .gte('entregada_en', desdeISO)
    .lt('entregada_en', hastaISO)
    .order('entregada_en', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as Record<string, unknown>[]).map(mapOrdenRow)
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
  return (data as Record<string, unknown>[]).map(mapOrdenRow)
}

export interface HistorialPlaca {
  clienteNombre: string
  clienteTelefono?: string
  clienteCorreo?: string
  tipoVehiculoId: string
  comboId?: string
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
    comboId: (data.comboId as string | null) ?? undefined,
  }
}

// Alerta de doble registro (M2): ¿esta placa ya tiene una orden en_proceso ahora mismo? Se usa en
// recepción al escribir la placa de una moto, para avisar antes de registrar dos veces el mismo
// vehículo por error (ej. lo escribieron con espacios/otra vez sin darse cuenta de que ya estaba
// en cola). Solo `en_proceso` — una vez listo/entregado ya no hay riesgo de "doble lavado".
export async function fetchOrdenEnProcesoPorPlaca(placa: string): Promise<Orden | undefined> {
  const normalizada = placa.trim().toUpperCase()
  if (!normalizada) return undefined

  const { data, error } = await db
    .from('ordenes')
    .select(ORDEN_SELECT)
    .eq('placa', normalizada)
    .eq('estado', 'en_proceso')
    .order('consecutivo', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapOrdenRow(data as unknown as Record<string, unknown>) : undefined
}

// Precio del combo — dos caminos según `combos.precio_fijo` (ver 0022_combo_precio_fijo.sql):
// - false (default, autos/camionetas): suma del precio "de combo" de cada servicio que lo
//   compone. Si al combo le falta el precio de algún servicio para ese tipo, `undefined`
//   (criterio "todo o nada" de siempre).
// - true (motos — "funciona diferente a los carros"): precio directo por tipo de vehículo en
//   precios_combo_fijo, sin composición de servicios.
async function precioComboVigente(comboId: string, tipoVehiculoId: string): Promise<number | undefined> {
  const { data: combo, error: errorCombo } = await db
    .from('combos')
    .select('precioFijo:precio_fijo')
    .eq('id', comboId)
    .single()
  if (errorCombo) throw new Error(errorCombo.message)

  if ((combo as { precioFijo: boolean }).precioFijo) {
    const { data, error } = await db
      .from('precios_combo_fijo')
      .select('precio')
      .eq('combo_id', comboId)
      .eq('tipo_vehiculo_id', tipoVehiculoId)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return data?.precio
  }

  const { data: relaciones, error: errorRelaciones } = await db
    .from('combo_servicios')
    .select('servicioId:servicio_id')
    .eq('combo_id', comboId)
  if (errorRelaciones) throw new Error(errorRelaciones.message)

  const servicioIds = (relaciones as { servicioId: string }[]).map((r) => r.servicioId)
  if (servicioIds.length === 0) return undefined

  const { data: precios, error: errorPrecios } = await db
    .from('precios_servicios_combo')
    .select('precio')
    .eq('tipo_vehiculo_id', tipoVehiculoId)
    .in('servicio_id', servicioIds)
  if (errorPrecios) throw new Error(errorPrecios.message)

  const filas = precios as { precio: number }[]
  if (filas.length !== servicioIds.length) return undefined
  return filas.reduce((suma, fila) => suma + fila.precio, 0)
}

interface ServicioIndividual {
  servicioId: string
  precio: number
  nombre: string
}

// Precio de cada servicio individual elegido (sea porque la orden no lleva combo, o porque se
// agrega suelto encima de uno) — siempre el precio individual, nunca el de combo (regla de
// negocio confirmada: el recargo por venderse solo/suelto es real). Falla si falta el precio de
// alguno (mismo criterio que el combo: nunca se cobra un total parcial).
async function preciosIndividuales(servicioIds: string[], tipoVehiculoId: string): Promise<ServicioIndividual[]> {
  if (servicioIds.length === 0) return []

  const { data, error } = await db
    .from('precios_servicios_individual')
    .select('servicioId:servicio_id, precio, servicios(nombre)')
    .eq('tipo_vehiculo_id', tipoVehiculoId)
    .in('servicio_id', servicioIds)
  if (error) throw new Error(error.message)

  const filas = data as unknown as { servicioId: string; precio: number; servicios: { nombre: string } | null }[]
  if (filas.length !== servicioIds.length) {
    throw new Error('No existe un precio individual configurado para alguno de los servicios elegidos y ese tipo de vehículo')
  }
  return filas.map((f) => ({ servicioId: f.servicioId, precio: f.precio, nombre: f.servicios?.nombre ?? '' }))
}

// Registro de ingreso (M2) — sin cobro todavía. El precio y la comisión quedan fijados desde
// ya (regla de negocio 1), pero el método de pago se captura en `cobrarYEntregarOrden`. El
// combo ya no es obligatorio: el total combina el combo (si lo hay) más los servicios
// individuales elegidos (sea que acompañen al combo o que sean todo lo que lleva la orden).
export async function createOrden(input: OrdenInput): Promise<Orden> {
  const parsed = ordenInputSchema.parse(input)
  const [precioCombo, addons, configuracion, turno] = await Promise.all([
    parsed.comboId ? precioComboVigente(parsed.comboId, parsed.tipoVehiculoId) : Promise.resolve(0),
    preciosIndividuales(parsed.serviciosAdicionales, parsed.tipoVehiculoId),
    fetchConfiguracion(),
    fetchTurnoAbierto('jefe_zona'),
  ])
  if (!turno) {
    throw new Error('No hay turno de caja abierto — ábrelo antes de registrar vehículos.')
  }
  if (parsed.comboId && precioCombo === undefined) {
    throw new Error('No existe un precio configurado para ese combo y tipo de vehículo')
  }

  const recargo = parsed.altoCilindraje ? configuracion.recargoAltoCilindraje : 0
  const total = (precioCombo ?? 0) + addons.reduce((suma, addon) => suma + addon.precio, 0) + recargo
  const comisionLavador = Math.round(total * configuracion.comisionLavadorPorcentaje)
  // Comisión del jefe de patio EN TURNO al registrar el vehículo — turno ya se exige arriba
  // (turno abierto de jefe_zona), así que responsableActual siempre existe acá. El negocio se
  // lleva lo que quede de las dos comisiones, no un porcentaje fijo aparte.
  const comisionJefeZona = Math.round(total * configuracion.comisionJefeZonaPorcentaje)
  const comisionNegocio = total - comisionLavador - comisionJefeZona

  const { data, error } = await db
    .from('ordenes')
    .insert({
      placa: parsed.placa,
      cliente_nombre: parsed.clienteNombre,
      cliente_telefono: parsed.clienteTelefono,
      cliente_correo: parsed.clienteCorreo,
      tipo_vehiculo_id: parsed.tipoVehiculoId,
      combo_id: parsed.comboId,
      lavador_id: parsed.lavadorId ?? null,
      lavador_id_2: parsed.lavadorId2 ?? null,
      precio: total,
      alto_cilindraje: parsed.altoCilindraje,
      comision_lavador: comisionLavador,
      comision_jefe_zona: comisionJefeZona,
      jefe_zona_responsable: turno.responsableActual,
      comision_negocio: comisionNegocio,
      observaciones: parsed.observaciones,
    })
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)

  const orden = mapOrdenRow(data as unknown as Record<string, unknown>)

  // No atómico (mismo criterio ya documentado en `generarLiquidacion`): si esto falla, la orden
  // ya quedó creada con el total correcto pero sin sus filas de add-on — se reporta explícito
  // en vez de fallar en silencio, para revisión manual.
  if (addons.length > 0) {
    const { error: errorAddons } = await db.from('orden_servicios').insert(
      addons.map((addon) => ({
        orden_id: orden.id,
        servicio_id: addon.servicioId,
        tipo_vehiculo_id: parsed.tipoVehiculoId,
        precio: addon.precio,
      })),
    )
    if (errorAddons) {
      throw new Error(
        `La orden ${orden.id} (#${orden.consecutivo}) se creó por $${total} pero no se pudieron registrar ${addons.length} servicio(s) adicional(es): ${errorAddons.message}. Revisar manualmente.`,
      )
    }
  }

  // Rotación (regla de negocio 9): si el vehículo se lava entre 2, cuenta como atendido para
  // ambos — los dos avanzan en la cola, no solo el principal.
  if (parsed.lavadorId) {
    await registrarAsignacion(parsed.lavadorId)
  }
  if (parsed.lavadorId2) {
    await registrarAsignacion(parsed.lavadorId2)
  }
  return { ...orden, serviciosAdicionales: addons.map(({ servicioId, nombre, precio }) => ({ servicioId, nombre, precio })) }
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
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}

// M3: corrige un "Finalizar lavado" hecho por equivocación (se pudo pasar de columna sin
// querer) — vuelve la orden a en_proceso y limpia lo que había fijado marcarListo (lista_en,
// tiempo_lavado_segundos) para que, si se vuelve a finalizar más adelante, esos valores salgan
// frescos y no queden datos de la vuelta anterior. También limpia el check de "ya avisé al
// cliente" (notificado_listo) — ya no aplica mientras el vehículo no esté listo otra vez.
export async function volverAProceso(id: string): Promise<Orden> {
  const { data, error } = await db
    .from('ordenes')
    .update({ estado: 'en_proceso', lista_en: null, tiempo_lavado_segundos: null, notificado_listo: false })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}

// M3: reasignar lavador si el asignado se ausenta o queda ocupado a mitad de un lavado — también
// sirve para ASIGNAR por primera vez una orden que se registró sin lavador (todos ocupados al
// recibirla, ver createOrden), y para QUITAR la asignación y dejarla "sin asignar" otra vez
// (`nuevoLavadorId: null` — típicamente porque se asignó mal). No recalcula precio/comisión
// (dependen del combo, no de quién lo hace) — solo cambia quién lo hace y, si hay lavador nuevo,
// actualiza la cola de rotación a su favor (regla de negocio 3: un vehículo, un solo lavador).
// `slot` distingue el lavador principal (1, columna `lavador_id`) del segundo lavador de un
// "lavar entre 2" (2, columna `lavador_id_2`) — mismo modal/función sirve para asignar, cambiar o
// quitar cualquiera de los dos desde el tablero de seguimiento.
export async function reasignarLavador(id: string, nuevoLavadorId: string | null, slot: 1 | 2 = 1): Promise<Orden> {
  const columna = slot === 1 ? 'lavador_id' : 'lavador_id_2'
  const { data, error } = await db
    .from('ordenes')
    .update({ [columna]: nuevoLavadorId })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  if (!nuevoLavadorId) {
    return mapOrdenRow(data as unknown as Record<string, unknown>)
  }
  await registrarAsignacion(nuevoLavadorId)
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}

// Marca manual de "ya le avisamos al cliente que su vehículo está listo" — control operativo del
// tablero de seguimiento, no dispara ningún efecto de negocio (no cobra, no cambia estado).
export async function marcarNotificado(id: string, notificado: boolean): Promise<Orden> {
  const { data, error } = await db
    .from('ordenes')
    .update({ notificado_listo: notificado })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}

// Cambiar el tipo de vehículo de una orden ANTES de cobrar (se registró "auto" y era
// "camioneta" / "camioneta de platón", etc.). Va por la RPC `cambiar_tipo_orden`
// (0038_cambiar_tipo_orden.sql), no por un UPDATE suelto: cambiar el tipo cambia la tarifa
// (regla 1), así que la función recalcula `precio`, las dos comisiones y el precio de cada
// servicio adicional al nuevo tipo, todo atómico. Solo permite tipos de la misma categoría que
// el combo y falla ("todo o nada") si al combo o a algún adicional le falta el precio para el
// nuevo tipo. Solo con la orden en `en_proceso` / `listo`.
export async function cambiarTipoOrden(id: string, tipoVehiculoId: string): Promise<Orden> {
  const { data, error } = await db
    .rpc('cambiar_tipo_orden', { p_orden_id: id, p_tipo_vehiculo_id: tipoVehiculoId })
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}

// Corrige un dato de contacto o la placa mal tomados en recepción mientras el vehículo sigue
// en_proceso o listo — combo/lavador no se tocan aquí. El tipo de vehículo sí se puede corregir,
// pero por `cambiarTipoOrden` (recalcula la tarifa), no por este UPDATE plano. No hay guarda de
// estado a nivel de base de datos (mismo criterio que reasignarLavador): la UI solo ofrece la
// acción en esas dos columnas del tablero.
export async function editarInfoCliente(id: string, input: ClienteInfoInput): Promise<Orden> {
  const parsed = clienteInfoInputSchema.parse(input)
  const { data, error } = await db
    .from('ordenes')
    .update({
      placa: parsed.placa,
      cliente_nombre: parsed.clienteNombre,
      cliente_telefono: parsed.clienteTelefono ?? null,
      cliente_correo: parsed.clienteCorreo ?? null,
    })
    .eq('id', id)
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}

// Cobro + entrega en un solo paso (M3: nunca se entrega sin cobrar). Aquí es donde el dinero
// entra a caja de verdad — `entregada_en` es lo que cuentan los dashboards, no `creado_en`.
// Se etiqueta con el turno de jefe de zona abierto en ESE momento (regla de negocio 11: el
// movimiento pertenece al turno en que se registró, y el cobro es el movimiento de dinero real
// — no el registro del vehículo, que puede haber pasado en un turno anterior).
//
// Descuento sobre el lavado, absorbido por el negocio (0037): baja el total a cobrar, NUNCA las
// comisiones (siguen sobre `precio` de lista, ya fijadas al crear la orden). `monto` es el valor
// absoluto ya resuelto; `pct` viaja solo para auditoría/recibo. Exige `motivo` y `autorizadoPor`.
export interface DescuentoInput {
  monto: number
  pct?: number
  motivo: string
  autorizadoPor: string
}

// Va por la RPC `cobrar_orden` (0036 + 0037), no por un UPDATE suelto: la entrega de la orden,
// sus líneas de pago (tabla `pagos`, 1–3 por cobro), el descuento y la liquidación de los
// productos de nevera cargados (`ventas` 'pendiente' → 'activa' + salida de stock) tienen que
// quedar en la misma transacción. La RPC valida que las líneas sumen EXACTO `(precio − descuento)
// + productos`, la referencia por línea, y calcula tiempo de espera + turno. Si el total queda en
// $0 (cortesía), `pagos` va vacío.
export async function cobrarYEntregarOrden(
  id: string,
  pagos: PagoLineaInput[],
  descuento?: DescuentoInput,
): Promise<Orden> {
  const { data, error } = await db
    .rpc('cobrar_orden', {
      p_orden_id: id,
      p_pagos: pagos.map((l) => ({ metodo: l.metodo, monto: l.monto, referencia: l.referencia ?? null })),
      p_descuento: descuento?.monto ?? 0,
      p_descuento_pct: descuento?.pct ?? null,
      p_descuento_motivo: descuento?.motivo ?? null,
      p_descuento_autorizado_por: descuento?.autorizadoPor ?? null,
    })
    .select(ORDEN_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return mapOrdenRow(data as unknown as Record<string, unknown>)
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
  return mapOrdenRow(data as unknown as Record<string, unknown>)
}
