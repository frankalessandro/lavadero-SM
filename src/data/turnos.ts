import { db } from '../lib/db'
import { fetchEfectivoDeTurno } from './pagos'
import { lineasPayload } from './conteosInventario'
import type { ConteoLineaInput } from '../schemas/conteoInventario'
import {
  abrirTurnoInputSchema,
  turnoCajaSchema,
  traspasoTurnoSchema,
  type AbrirTurnoInput,
  type RolCaja,
  type TurnoCaja,
  type TraspasoTurno,
} from '../schemas/turnoCaja'

const TURNO_SELECT =
  'id, rol, responsable, responsableActual:responsable_actual, responsablePersonaId:responsable_persona_id, responsableActualPersonaId:responsable_actual_persona_id, traspasoPendienteAPersonaId:traspaso_pendiente_a_persona_id, traspasoPendienteANombre:traspaso_pendiente_a_nombre, baseInicial:base_inicial, abiertoEn:abierto_en, cerrado, conteoFisico:conteo_fisico, valorEsperado:valor_esperado, diferencia, justificacionDiferencia:justificacion_diferencia, cerradoPor:cerrado_por, cerradoEn:cerrado_en, recibidoPor:recibido_por'

const TRASPASO_SELECT =
  'id, turnoId:turno_id, de, a, dePersonaId:de_persona_id, aPersonaId:a_persona_id, hechoEn:hecho_en, conteoId:conteo_id'

export async function fetchTurnoAbierto(rol: RolCaja): Promise<TurnoCaja | undefined> {
  const { data, error } = await db
    .from('turnos_caja')
    .select(TURNO_SELECT)
    .eq('rol', rol)
    .eq('cerrado', false)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? turnoCajaSchema.parse(data) : undefined
}

export async function fetchTurnos(rol?: RolCaja): Promise<TurnoCaja[]> {
  let query = db.from('turnos_caja').select(TURNO_SELECT).order('abierto_en', { ascending: false })
  if (rol) query = query.eq('rol', rol)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return turnoCajaSchema.array().parse(data)
}

// El responsable ya no viaja desde el cliente (0072) — la RPC lo deriva de auth.uid() en el
// servidor, así que abrir turno "a nombre de otro" ya no es posible.
export async function abrirTurno(input: AbrirTurnoInput): Promise<TurnoCaja> {
  const parsed = abrirTurnoInputSchema.parse(input)
  const { data, error } = await db
    .rpc('abrir_turno', { p_rol: parsed.rol, p_base_inicial: parsed.baseInicial })
    .select(TURNO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}

// Traspaso en dos pasos (0072): quien tiene el turno "solicita" el traspaso — si es jefe_zona con
// inventario a cargo (apertura contada, sin cierre), el conteo se registra en este mismo paso,
// con quien entrega presente — pero el responsable NO cambia todavía. Solo cuando la cuenta
// destino llama a `aceptarTraspaso` (con su propia sesión) el turno pasa a su nombre. Nadie puede
// tomar la responsabilidad en nombre de otra persona.
export async function solicitarTraspaso(
  turnoId: string,
  aPersonaId: string,
  conteo?: { lineas: ConteoLineaInput[]; justificacion: string | undefined; desde: string; confirmados: string[] },
): Promise<TurnoCaja> {
  const { data, error } = await db
    .rpc('solicitar_traspaso_turno', {
      p_turno_id: turnoId,
      p_a_persona_id: aPersonaId,
      p_lineas: conteo ? lineasPayload(conteo.lineas) : null,
      p_justificacion: conteo?.justificacion ?? null,
      p_desde: conteo?.desde ?? null,
      p_confirmados: conteo?.confirmados ?? null,
    })
    .select(TURNO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}

// Solo puede aceptar la cuenta destino del traspaso pendiente (auth.uid() lo valida server-side).
export async function aceptarTraspaso(turnoId: string): Promise<TurnoCaja> {
  const { data, error } = await db.rpc('aceptar_traspaso_turno', { p_turno_id: turnoId }).select(TURNO_SELECT).single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}

// Cancela un traspaso pendiente — lo puede hacer quien lo pidió (se arrepiente) o quien iba a
// recibirlo (lo rechaza).
export async function cancelarTraspaso(turnoId: string): Promise<TurnoCaja> {
  const { data, error } = await db.rpc('cancelar_traspaso_turno', { p_turno_id: turnoId }).select(TURNO_SELECT).single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}

export async function fetchTraspasos(turnoId: string): Promise<TraspasoTurno[]> {
  const { data, error } = await db
    .from('traspasos_turno')
    .select(TRASPASO_SELECT)
    .eq('turno_id', turnoId)
    .order('hecho_en', { ascending: false })
  if (error) throw new Error(error.message)
  return traspasoTurnoSchema.array().parse(data)
}

// Efectivo del turno = suma de las LÍNEAS DE PAGO en efectivo imputadas a ese turno (tabla
// `pagos`, 0036), no la columna-resumen `metodo_pago` de la orden/venta — un cobro repartido
// puede tener parte en efectivo y parte no. `fetchEfectivoDeTurno` separa lavados (pagos con
// orden_id) de ventas de mostrador (pagos con venta_grupo_id); las líneas anuladas —por
// anulación del cobro o por una corrección de reparto— quedan fuera.

async function gastosDeCaja(turnoId: string): Promise<number> {
  const { data, error } = await db.from('gastos').select('monto').eq('turno_id', turnoId).eq('origen', 'caja')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, g) => total + (g.monto as number), 0)
}

// Compras de inventario pagadas con la caja de este turno (0064) — mismo mecanismo que
// gastosDeCaja: salen del efectivo esperado. Las pagadas por gerencia (origen_pago='gerencia')
// no tienen turno_id, así que no aparecen acá.
async function comprasDeCaja(turnoId: string): Promise<number> {
  const { data, error } = await db
    .from('compras')
    .select('total')
    .eq('turno_id', turnoId)
    .eq('origen_pago', 'caja')
    .eq('estado', 'activa')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce((total, c) => total + (c.total as number), 0)
}

// Deudas del personal que movieron efectivo de esta caja (0065/0070): préstamos (salen, monto
// positivo) y abonos en efectivo (entran, monto negativo en el ledger). Mismo mecanismo que
// compras/gastos — cuentan en el momento, sin importar cuándo se salde la deuda.
async function deudasDeCaja(turnoId: string): Promise<{ prestamos: number; abonos: number }> {
  const { data, error } = await db
    .from('deudas_personal')
    .select('tipo, monto')
    .eq('turno_id', turnoId)
    .in('tipo', ['prestamo', 'abono'])
    .eq('estado', 'activo')
  if (error) throw new Error(error.message)
  let prestamos = 0
  let abonos = 0
  for (const d of data as { tipo: string; monto: number }[]) {
    if (d.tipo === 'prestamo') prestamos += d.monto
    else abonos += -d.monto
  }
  return { prestamos, abonos }
}

// Solo la modalidad efectivo es dinero físico que se puede contar — transferencia y datáfono no
// entran al arqueo (ninguno de los dos es billete en la caja, aunque datáfono sí cuenta como
// ingreso/ganancia del día — ver StatCards de /admin y /jefe-zona). Gastos en caja se asumen
// pagados en efectivo desde la misma caja.
export async function calcularValorEsperado(turno: TurnoCaja): Promise<number> {
  // Compras, préstamos y abonos solo aplican al turno de jefe_zona (es la única caja que los
  // mueve, ver registrar_compra/0064 y registrar_prestamo_personal/0070) — vigilante nunca tiene
  // ninguno cargado a su turno.
  const [gastos, compras, deudas] = await Promise.all([
    gastosDeCaja(turno.id),
    turno.rol === 'jefe_zona' ? comprasDeCaja(turno.id) : Promise.resolve(0),
    turno.rol === 'jefe_zona' ? deudasDeCaja(turno.id) : Promise.resolve({ prestamos: 0, abonos: 0 }),
  ])
  const salidas = gastos + compras + deudas.prestamos

  let ingresos: number
  if (turno.rol === 'jefe_zona') {
    const { lavados, ventas } = await fetchEfectivoDeTurno(turno.id)
    ingresos = lavados + ventas + deudas.abonos
  } else {
    const estanciasRes = await db
      .from('estancias_parqueadero')
      .select('cobro')
      .eq('turno_id', turno.id)
      .eq('estado', 'fuera')
      .eq('metodo_pago', 'efectivo')
    if (estanciasRes.error) throw new Error(estanciasRes.error.message)
    ingresos = (estanciasRes.data ?? []).reduce((total, e) => total + ((e.cobro as number | null) ?? 0), 0)
  }

  return turno.baseInicial + ingresos - salidas
}

export interface DesgloseEsperado {
  base: number
  ingresosLavados: number
  ingresosVentas: number
  gastos: number
  // Compras de inventario pagadas con esta caja (0064) — 0 para el turno de vigilante.
  compras: number
  // Préstamos en efectivo al personal desde esta caja (0065/0070) — 0 para el turno de vigilante.
  prestamos: number
  // Abonos a deudas del personal pagados en efectivo a esta caja (0070).
  abonos: number
  total: number
}

// Mismas fuentes que calcularValorEsperado, pero separadas — solo para mostrar el detalle en el
// paso 2 del cierre de turno (arqueo ciego). Ingresos por lavados y por ventas se ven aparte
// (como pidió el negocio), pero todos suman al mismo total esperado.
export async function desgloseEsperado(turno: TurnoCaja): Promise<DesgloseEsperado> {
  const [gastos, compras, deudas] = await Promise.all([
    gastosDeCaja(turno.id),
    turno.rol === 'jefe_zona' ? comprasDeCaja(turno.id) : Promise.resolve(0),
    turno.rol === 'jefe_zona' ? deudasDeCaja(turno.id) : Promise.resolve({ prestamos: 0, abonos: 0 }),
  ])
  const { lavados: ingresosLavados, ventas: ingresosVentas } =
    turno.rol === 'jefe_zona' ? await fetchEfectivoDeTurno(turno.id) : { lavados: 0, ventas: 0 }
  const { prestamos, abonos } = deudas
  const total =
    turno.rol === 'jefe_zona'
      ? turno.baseInicial + ingresosLavados + ingresosVentas + abonos - gastos - compras - prestamos
      : await calcularValorEsperado(turno)
  return { base: turno.baseInicial, ingresosLavados, ingresosVentas, gastos, compras, prestamos, abonos, total }
}

export async function cerrarTurno(
  turno: TurnoCaja,
  conteoFisico: number,
  cerradoPor: string,
  justificacionDiferencia?: string,
  recibidoPor?: string,
): Promise<TurnoCaja> {
  const valorEsperado = await calcularValorEsperado(turno)
  const diferencia = conteoFisico - valorEsperado

  if (diferencia !== 0 && !justificacionDiferencia) {
    throw new Error('Hay una diferencia en el arqueo — la justificación es obligatoria para cerrar el turno.')
  }

  const { data, error } = await db
    .from('turnos_caja')
    .update({
      cerrado: true,
      conteo_fisico: conteoFisico,
      valor_esperado: valorEsperado,
      diferencia,
      justificacion_diferencia: justificacionDiferencia,
      cerrado_por: cerradoPor,
      cerrado_en: new Date().toISOString(),
      recibido_por: recibidoPor,
    })
    .eq('id', turno.id)
    .eq('cerrado', false) // regla de negocio 14: un turno cerrado es inmodificable
    .select(TURNO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return turnoCajaSchema.parse(data)
}
