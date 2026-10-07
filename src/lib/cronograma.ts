import type { DiaDescanso } from '../schemas/asistencia'
import type { CronogramaExtra, PermisoLavador } from '../schemas/cronograma'
import { fechaLocalISO } from './periodo'

// Lógica pura del cronograma de lavadores (sin red): arma cada día a partir de lo que guarda la
// base. El Excel de la jefa pide, además de quién descansa (dias_descanso), dos turnos que se
// DERIVAN de ese descanso:
//   · "Entra 7am + lava baño": quien descansó el día anterior.
//   · "Sale 7pm": quien descansa al día siguiente — y el viernes, como no descansa nadie, sale el
//     mismo que entró.
// Si los muchachos se cambian entre ellos, ese cambio se guarda aparte (cronograma_dias) y pisa
// lo derivado solo en ese día; "restablecer" lo devuelve a la rotación.

export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function sumarDiasISO(iso: string, dias: number): string {
  const fecha = parseISO(iso)
  fecha.setDate(fecha.getDate() + dias)
  return fechaLocalISO(fecha)
}

/** 0 = lunes … 6 = domingo. */
export function diaSemanaISO(iso: string): number {
  return (parseISO(iso).getDay() + 6) % 7
}

export interface DiaCronograma {
  fecha: string
  /** 0 = lunes … 6 = domingo. */
  diaSemana: number
  descansaId?: string
  /** Quién cambió el descanso a mano (undefined = rotación sin tocar). */
  descansoCambiadoPor?: string
  banoId?: string
  /** El lavador del baño lo cambiaron a mano (no es el derivado). */
  banoManual: boolean
  saleId?: string
  saleManual: boolean
  banoHecho?: { en: string; por: string }
  /** Permisos vigentes (no anulados) de ese día. */
  permisos: PermisoLavador[]
  actualizadoPor?: string
}

export function armarDias(
  desdeISO: string,
  hastaISO: string,
  descansos: DiaDescanso[],
  extras: CronogramaExtra[],
  permisos: PermisoLavador[],
): DiaCronograma[] {
  const descansoPorFecha = new Map(descansos.map((d) => [d.fecha, d]))
  const extraPorFecha = new Map(extras.map((e) => [e.fecha, e]))
  const dias: DiaCronograma[] = []

  for (let fecha = desdeISO; fecha <= hastaISO; fecha = sumarDiasISO(fecha, 1)) {
    const diaSemana = diaSemanaISO(fecha)
    const descanso = descansoPorFecha.get(fecha)
    const extra = extraPorFecha.get(fecha)

    const banoDerivado = descansoPorFecha.get(sumarDiasISO(fecha, -1))?.lavadorId
    // El domingo nadie sale temprano aunque el lunes siguiente tenga a alguien descansando: el
    // fin de semana trabajan todos.
    const saleDerivado =
      diaSemana === 4
        ? banoDerivado
        : diaSemana === 6
          ? undefined
          : descansoPorFecha.get(sumarDiasISO(fecha, 1))?.lavadorId

    dias.push({
      fecha,
      diaSemana,
      descansaId: descanso?.lavadorId,
      descansoCambiadoPor: descanso?.actualizadoPor,
      banoId: extra?.banoLavadorId ?? banoDerivado,
      banoManual: !!extra?.banoLavadorId,
      saleId: extra?.saleLavadorId ?? saleDerivado,
      saleManual: !!extra?.saleLavadorId,
      banoHecho:
        extra?.banoHechoEn && extra.banoHechoPor ? { en: extra.banoHechoEn, por: extra.banoHechoPor } : undefined,
      permisos: permisos.filter((p) => p.fecha === fecha && !p.anulado),
      actualizadoPor: extra?.actualizadoPor,
    })
  }
  return dias
}

export interface ResumenLavadorMes {
  lavadorId: string
  descansos: number
  banosAsignados: number
  banosHechos: number
  permisos: number
}

export interface ResumenMes {
  banosAsignados: number
  banosHechos: number
  /** Días ya pasados con baño asignado que nadie marcó como hecho. */
  banosSinMarcar: DiaCronograma[]
  permisos: number
  cambiosAMano: number
  porLavador: ResumenLavadorMes[]
}

// Seguimiento del mes. El baño de HOY todavía puede hacerse, así que no cuenta como "sin marcar"
// hasta que pase el día; tampoco se exige un baño futuro.
export function resumirMes(dias: DiaCronograma[], hoyISO: string): ResumenMes {
  const porLavador = new Map<string, ResumenLavadorMes>()
  const de = (id: string) => {
    let r = porLavador.get(id)
    if (!r) {
      r = { lavadorId: id, descansos: 0, banosAsignados: 0, banosHechos: 0, permisos: 0 }
      porLavador.set(id, r)
    }
    return r
  }

  let banosAsignados = 0
  let banosHechos = 0
  let permisos = 0
  let cambiosAMano = 0
  const banosSinMarcar: DiaCronograma[] = []

  for (const dia of dias) {
    if (dia.descansaId) de(dia.descansaId).descansos += 1
    if (dia.banoManual || dia.saleManual || dia.descansoCambiadoPor) cambiosAMano += 1
    for (const p of dia.permisos) {
      permisos += 1
      de(p.lavadorId).permisos += 1
    }
    if (dia.banoId && dia.fecha <= hoyISO) {
      banosAsignados += 1
      de(dia.banoId).banosAsignados += 1
      if (dia.banoHecho) {
        banosHechos += 1
        de(dia.banoId).banosHechos += 1
      } else if (dia.fecha < hoyISO) {
        banosSinMarcar.push(dia)
      }
    }
  }

  return { banosAsignados, banosHechos, banosSinMarcar, permisos, cambiosAMano, porLavador: [...porLavador.values()] }
}

/** Primer y último día (ISO) de un mes (`mes0` = 0..11). */
export function limitesDeMes(anio: number, mes0: number): { desde: string; hasta: string } {
  return { desde: fechaLocalISO(new Date(anio, mes0, 1)), hasta: fechaLocalISO(new Date(anio, mes0 + 1, 0)) }
}
