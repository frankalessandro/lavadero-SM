import { useEffect, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Modal } from './Modal'
import { Button } from './Button'
import type { DiaConPendiente } from '../../data/liquidaciones'
import { fechaLocalISO } from '../../lib/periodo'

export type TipoPeriodoLiquidacion = 'dia' | 'quincena' | 'mes'

export interface RangoLiquidacion {
  periodoInicio: string
  periodoFin: string
  label: string
}

const MES_LARGO = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })
const DIA_LARGO = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const DIA_LISTA = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'short' })
const DIA_CORTO = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

interface MesAnio {
  anio: number
  mes: number // 0–11
}

function mesAnterior({ anio, mes }: MesAnio): MesAnio {
  return mes === 0 ? { anio: anio - 1, mes: 11 } : { anio, mes: mes - 1 }
}

function mesSiguiente({ anio, mes }: MesAnio): MesAnio {
  return mes === 11 ? { anio: anio + 1, mes: 0 } : { anio, mes: mes + 1 }
}

function rangoDeQuincena({ anio, mes }: MesAnio, quincena: 1 | 2): RangoLiquidacion {
  const ultimo = new Date(anio, mes + 1, 0).getDate()
  const inicio = new Date(anio, mes, quincena === 1 ? 1 : 16)
  const fin = new Date(anio, mes, quincena === 1 ? 15 : ultimo)
  return {
    periodoInicio: fechaLocalISO(inicio),
    periodoFin: fechaLocalISO(fin),
    label: `${quincena === 1 ? '1ª' : '2ª'} quincena de ${MES_LARGO.format(inicio)} (${DIA_CORTO.format(inicio)} – ${DIA_CORTO.format(fin)})`,
  }
}

function rangoDeMes({ anio, mes }: MesAnio): RangoLiquidacion {
  const inicio = new Date(anio, mes, 1)
  const fin = new Date(anio, mes + 1, 0)
  return { periodoInicio: fechaLocalISO(inicio), periodoFin: fechaLocalISO(fin), label: capitalizar(MES_LARGO.format(inicio)) }
}

const TITULOS: Record<TipoPeriodoLiquidacion, string> = {
  dia: 'Liquidar un día',
  quincena: 'Liquidación quincenal',
  mes: 'Liquidación mensual',
}

// Elige el periodo de una liquidación. Día: cualquier fecha hasta hoy. Quincena (1–15 / 16–fin de
// mes) y mes: arrancan en el último periodo ya terminado, que es lo que normalmente se paga, y se
// puede navegar hacia atrás. No se ofrecen periodos que todavía no empiezan.
export function ElegirPeriodoLiquidacionModal({
  tipo,
  nombre,
  calculando,
  cargarDias,
  onConfirm,
  onClose,
}: {
  tipo: TipoPeriodoLiquidacion
  nombre: string
  calculando: boolean
  /** Solo para `tipo="dia"`: días con dinero por liquidar, para mostrarlos de una vez. */
  cargarDias?: () => Promise<DiaConPendiente[]>
  onConfirm: (rango: RangoLiquidacion) => void
  onClose: () => void
}) {
  const hoy = new Date()
  const hoyISO = fechaLocalISO(hoy)
  const mesActual: MesAnio = { anio: hoy.getFullYear(), mes: hoy.getMonth() }

  // Último periodo terminado: quincena → la 1ª si ya pasó el 15, si no la 2ª del mes anterior;
  // mes → el mes anterior.
  const quincenaInicial: { mes: MesAnio; quincena: 1 | 2 } =
    hoy.getDate() >= 16 ? { mes: mesActual, quincena: 1 } : { mes: mesAnterior(mesActual), quincena: 2 }
  const [dia, setDia] = useState('')
  // null = cargando; [] = ningún día con dinero.
  const [dias, setDias] = useState<DiaConPendiente[] | null>(null)
  const [errorDias, setErrorDias] = useState<string | null>(null)

  useEffect(() => {
    if (tipo !== 'dia' || !cargarDias) return
    let cancelado = false
    cargarDias()
      .then((lista) => {
        if (cancelado) return
        setDias(lista)
        setDia(lista[0]?.fecha ?? '')
      })
      .catch((err) => {
        if (!cancelado) setErrorDias(err instanceof Error ? err.message : 'No se pudieron cargar los días')
      })
    return () => {
      cancelado = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [mesQuincena, setMesQuincena] = useState<MesAnio>(quincenaInicial.mes)
  const [quincena, setQuincena] = useState<1 | 2>(quincenaInicial.quincena)
  const [mesElegido, setMesElegido] = useState<MesAnio>(mesAnterior(mesActual))

  const navMes = tipo === 'quincena' ? mesQuincena : mesElegido
  const setNavMes = tipo === 'quincena' ? setMesQuincena : setMesElegido
  const esMesActual = navMes.anio === mesActual.anio && navMes.mes === mesActual.mes

  const sinDia = tipo === 'dia' && !dia
  const rango: RangoLiquidacion =
    tipo === 'dia'
      ? {
          periodoInicio: dia,
          periodoFin: dia,
          label: dia ? capitalizar(DIA_LARGO.format(new Date(`${dia}T12:00:00`))) : '—',
        }
      : tipo === 'quincena'
        ? rangoDeQuincena(mesQuincena, quincena)
        : rangoDeMes(mesElegido)
  const empiezaEnElFuturo = rango.periodoInicio > hoyISO

  return (
    <Modal
      size="sm"
      icon={CalendarDays}
      title={TITULOS[tipo]}
      subtitle={nombre}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={calculando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={calculando} disabled={empiezaEnElFuturo || sinDia} onClick={() => onConfirm(rango)}>
            Continuar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {tipo === 'dia' ? (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-neutral-700">Días con dinero por liquidar</span>
            {errorDias ? (
              <p className="rounded-xl bg-danger-50 px-3 py-3 text-sm text-danger-700">{errorDias}</p>
            ) : dias === null ? (
              <p className="rounded-xl bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-400">Buscando días…</p>
            ) : dias.length === 0 ? (
              <p className="rounded-xl bg-neutral-50 px-3 py-6 text-center text-sm text-neutral-500">
                No hay días con dinero por liquidar.
              </p>
            ) : (
              <ul className="custom-scroll flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
                {dias.map((d) => (
                  <li key={d.fecha}>
                    <button
                      type="button"
                      onClick={() => setDia(d.fecha)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        dia === d.fecha
                          ? 'border-primary-500 bg-primary-50 shadow-nav-active'
                          : 'border-neutral-200 bg-white hover:bg-neutral-50'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold capitalize text-neutral-900">
                          {DIA_LISTA.format(new Date(`${d.fecha}T12:00:00`))}
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {d.cantidadOrdenes} orden{d.cantidadOrdenes === 1 ? '' : 'es'}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-success-700">{COP.format(d.monto)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-neutral-100 p-1">
              <button
                type="button"
                onClick={() => setNavMes(mesAnterior(navMes))}
                aria-label="Mes anterior"
                className="flex size-10 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-white"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm font-semibold capitalize text-neutral-900">
                {MES_LARGO.format(new Date(navMes.anio, navMes.mes, 1))}
              </span>
              <button
                type="button"
                disabled={esMesActual}
                onClick={() => setNavMes(mesSiguiente(navMes))}
                aria-label="Mes siguiente"
                className="flex size-10 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {tipo === 'quincena' ? (
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map((q) => {
                  const r = rangoDeQuincena(mesQuincena, q)
                  const futura = r.periodoInicio > hoyISO
                  return (
                    <button
                      key={q}
                      type="button"
                      disabled={futura}
                      onClick={() => setQuincena(q)}
                      className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-sm transition-colors disabled:opacity-40 ${
                        quincena === q
                          ? 'border-primary-500 bg-primary-50 text-primary-700 shadow-nav-active'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                      }`}
                    >
                      <span className="font-semibold">{q === 1 ? '1ª quincena' : '2ª quincena'}</span>
                      <span className="text-xs text-neutral-500">{q === 1 ? 'del 1 al 15' : `del 16 al ${new Date(mesQuincena.anio, mesQuincena.mes + 1, 0).getDate()}`}</span>
                    </button>
                  )
                })}
              </div>
            ) : null}
          </>
        )}

        {sinDia ? null : (
        <div className="rounded-xl bg-primary-50/60 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-700">Periodo a liquidar</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-900">{rango.label}</p>
          {empiezaEnElFuturo ? <p className="mt-1 text-xs text-danger-600">Ese periodo todavía no empieza.</p> : null}
        </div>
        )}
      </div>
    </Modal>
  )
}
