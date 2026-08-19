import { db } from '../lib/db'
import {
  asistenciaLavadorSchema,
  diaDescansoSchema,
  marcarAsistenciaInputSchema,
  cambiarDescansoInputSchema,
  type AsistenciaLavador,
  type DiaDescanso,
  type MarcarAsistenciaInput,
  type CambiarDescansoInput,
} from '../schemas/asistencia'

const DIA_DESCANSO_SELECT = 'id, fecha, lavadorId:lavador_id, motivo, actualizadoEn:actualizado_en, actualizadoPor:actualizado_por'
const ASISTENCIA_SELECT = 'id, lavadorId:lavador_id, fecha, horaEntrada:hora_entrada, registradoPor:registrado_por, creadoEn:creado_en'

const UN_DIA_MS = 24 * 60 * 60 * 1000

// Regla fija del cronograma (Cronograma_Descanso_Ago-Dic_2026.xlsx, confirmado por Alessandro):
// 4 lavadores, uno descansa cada lunes-jueves — viernes a domingo trabajan todos por ser los
// días de más movimiento. El orden rota una posición a la derecha cada semana; con 4 lavadores
// el patrón se repite exacto cada 4 semanas, así que es 100% determinístico desde la fecha ancla
// (semana 1 del cronograma original) — no depende de qué tan lejos se haya generado antes.
const EPOCA_LUNES_UTC = Date.UTC(2026, 7, 17) // 17 ago 2026 (lunes), semana 1 del cronograma
const ORDEN_BASE_NOMBRES = ['Luis', 'Moises', 'Ivan', 'Javier'] // lunes, martes, miércoles, jueves de la semana 1

function toFechaISO(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10)
}

// undefined = ese día nadie descansa (viernes a domingo, o antes de que existiera el cronograma).
function posicionQueDescansa(utcMs: number): number | undefined {
  const diffDias = Math.round((utcMs - EPOCA_LUNES_UTC) / UN_DIA_MS)
  if (diffDias < 0) return undefined
  const diaSemana = diffDias % 7 // 0 = lunes ... 6 = domingo (la fecha ancla es un lunes)
  if (diaSemana > 3) return undefined
  const semanaIndex = Math.floor(diffDias / 7)
  const rotacion = semanaIndex % ORDEN_BASE_NOMBRES.length
  return (diaSemana + ORDEN_BASE_NOMBRES.length - rotacion) % ORDEN_BASE_NOMBRES.length
}

async function resolverIdsOrdenBase(): Promise<string[]> {
  const { data, error } = await db.from('lavadores').select('id, nombre').in('nombre', ORDEN_BASE_NOMBRES)
  if (error) throw new Error(error.message)
  const porNombre = new Map((data as { id: string; nombre: string }[]).map((l) => [l.nombre, l.id]))
  const ids = ORDEN_BASE_NOMBRES.map((nombre) => porNombre.get(nombre))
  if (ids.some((id) => !id)) {
    throw new Error(
      'No se encontraron los 4 lavadores del cronograma base (Luis, Moises, Ivan, Javier) en /admin/lavadores — revisa que no hayan cambiado de nombre.',
    )
  }
  return ids as string[]
}

export async function fetchDiasDescanso(desdeISO: string, hastaISO: string): Promise<DiaDescanso[]> {
  const { data, error } = await db
    .from('dias_descanso')
    .select(DIA_DESCANSO_SELECT)
    .gte('fecha', desdeISO)
    .lte('fecha', hastaISO)
    .order('fecha')
  if (error) throw new Error(error.message)
  return diaDescansoSchema.array().parse(data)
}

// Rellena las filas de dias_descanso que falten hasta `hastaISO` aplicando la fórmula de
// rotación — así el cronograma nunca se "acaba" aunque el Excel original solo cubría hasta
// dic 2026. `upsert` con `ignoreDuplicates` es seguro de llamar en cada visita a la pantalla
// (no pisa fechas ya generadas o editadas a mano).
export async function ensureDiasDescansoGenerados(hastaISO: string): Promise<void> {
  const hastaMs = new Date(hastaISO).getTime()
  if (Number.isNaN(hastaMs) || hastaMs < EPOCA_LUNES_UTC) return

  const ordenBaseIds = await resolverIdsOrdenBase()
  const filas: { fecha: string; lavador_id: string }[] = []
  for (let ms = EPOCA_LUNES_UTC; ms <= hastaMs; ms += UN_DIA_MS) {
    const posicion = posicionQueDescansa(ms)
    if (posicion === undefined) continue
    filas.push({ fecha: toFechaISO(ms), lavador_id: ordenBaseIds[posicion] })
  }
  if (filas.length === 0) return

  const { error } = await db.from('dias_descanso').upsert(filas, { onConflict: 'fecha', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}

// Cambio entre trabajadores (swap): corrige quién descansa una fecha puntual ya generada.
// No crea filas nuevas — si la fecha no existe todavía, primero hay que generarla
// (ensureDiasDescansoGenerados cubre eso en el loader de la pantalla).
export async function cambiarDescanso(fecha: string, input: CambiarDescansoInput): Promise<DiaDescanso> {
  const parsed = cambiarDescansoInputSchema.parse(input)
  const { data, error } = await db
    .from('dias_descanso')
    .update({ lavador_id: parsed.lavadorId, actualizado_en: new Date().toISOString(), actualizado_por: parsed.actualizadoPor })
    .eq('fecha', fecha)
    .select(DIA_DESCANSO_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return diaDescansoSchema.parse(data)
}

export async function fetchAsistenciasDelDia(fechaISO: string): Promise<AsistenciaLavador[]> {
  const { data, error } = await db.from('asistencias_lavadores').select(ASISTENCIA_SELECT).eq('fecha', fechaISO)
  if (error) throw new Error(error.message)
  return asistenciaLavadorSchema.array().parse(data)
}

// Marca la llegada de un lavador — una sola vez por día (unique(lavador_id, fecha) en la
// tabla). La UI deshabilita el botón tras marcar para no depender de este error en el flujo
// normal, pero igual queda protegido a nivel de base de datos ante doble clic/carrera.
export async function marcarAsistencia(fechaISO: string, input: MarcarAsistenciaInput): Promise<AsistenciaLavador> {
  const parsed = marcarAsistenciaInputSchema.parse(input)
  const { data, error } = await db
    .from('asistencias_lavadores')
    .insert({ lavador_id: parsed.lavadorId, fecha: fechaISO, registrado_por: parsed.registradoPor })
    .select(ASISTENCIA_SELECT)
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('Ese lavador ya tiene la asistencia marcada hoy.')
    throw new Error(error.message)
  }
  return asistenciaLavadorSchema.parse(data)
}
