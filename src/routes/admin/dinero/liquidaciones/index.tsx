import { useEffect, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Wallet, CheckCircle2, Receipt, Clock, ShieldCheck } from 'lucide-react'
import {
  fetchComisionesPendientes,
  fetchLiquidaciones,
  fetchMontoPeriodo,
  fetchDesgloseLiquidacion,
  fetchResumenPeriodoLavadores,
  generarLiquidacion,
  marcarLiquidacionPagada,
  type MontoPeriodo,
  type ResumenPeriodoLavador,
} from '../../../../data/liquidaciones'
import {
  fetchComisionesPendientesJefeZona,
  fetchLiquidacionesJefeZona,
  fetchMontoPeriodoJefeZona,
  fetchCantidadOrdenesLiquidacionJefeZona,
  fetchResumenPeriodoJefeZona,
  generarLiquidacionJefeZona,
  marcarLiquidacionJefeZonaPagada,
  type ComisionPendienteJefeZona,
  type MontoPeriodoJefeZona,
  type ResumenPeriodoJefeZona,
} from '../../../../data/liquidacionesJefeZona'
import { PeriodoSelector } from '../../../../components/layout/PeriodoSelector'
import { calcularRango, type ModoPeriodo } from '../../../../lib/periodo'
import { fetchLavadores } from '../../../../data/lavadores'
import { fetchConfiguracion } from '../../../../data/configuracion'
import { fetchTiposVehiculo } from '../../../../data/tiposVehiculo'
import { fetchCombos } from '../../../../data/combos'
import type { ComisionPendiente } from '../../../../data/liquidaciones'
import type { Liquidacion } from '../../../../schemas/liquidacion'
import type { LiquidacionJefeZona } from '../../../../schemas/liquidacionJefeZona'
import type { Lavador } from '../../../../schemas/lavador'
import type { Configuracion } from '../../../../schemas/configuracion'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { BarChart } from '../../../../components/layout/BarChart'
import { ColillaLiquidacionModal, type ColillaLiquidacionData } from '../../../../components/layout/ColillaLiquidacionModal'
import { ColillaJefeZonaModal, type ColillaJefeZonaData } from '../../../../components/layout/ColillaJefeZonaModal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

function hoyISO(offsetDias = 0): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + offsetDias)
  return fecha.toISOString().slice(0, 10)
}

async function loadData() {
  const [pendientes, historico, lavadores, configuracion, tiposVehiculo, combos, pendientesJefeZona, historicoJefeZona] =
    await Promise.all([
      fetchComisionesPendientes(),
      fetchLiquidaciones(),
      fetchLavadores(),
      fetchConfiguracion(),
      fetchTiposVehiculo(),
      fetchCombos(),
      fetchComisionesPendientesJefeZona(),
      fetchLiquidacionesJefeZona(),
    ])
  return { pendientes, historico, lavadores, configuracion, tiposVehiculo, combos, pendientesJefeZona, historicoJefeZona }
}

// Admin puede generar liquidación diaria (solo hoy) o semanal (últimos 7 días) para cualquier
// lavador, sin importar la periodicidad "normal" configurada — esa configuración (Configuración
// > periodicidad de liquidación) solo decide cuál de las dos se resalta como default en esta
// pantalla, ambas siguen disponibles siempre.
type Periodicidad = Configuracion['periodicidadLiquidacion']

function rangoPorPeriodicidad(periodicidad: Periodicidad): [string, string] {
  return periodicidad === 'diaria' ? [hoyISO(), hoyISO()] : [hoyISO(-7), hoyISO()]
}

export const Route = createFileRoute('/admin/dinero/liquidaciones/')({
  loader: loadData,
  component: LiquidacionesPage,
})

function LiquidacionesPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [pendientes, setPendientes] = useState(initial.pendientes)
  const [historico, setHistorico] = useState(initial.historico)
  const [lavadores, setLavadores] = useState(initial.lavadores)
  const [configuracion, setConfiguracion] = useState(initial.configuracion)
  const [tiposVehiculo] = useState(initial.tiposVehiculo)
  const [combos] = useState(initial.combos)
  const periodicidadLabel = configuracion.periodicidadLiquidacion === 'diaria' ? 'diaria' : 'semanal'
  const [generando, setGenerando] = useState<string | null>(null)
  // Clave `${lavadorId}:${periodicidad}` mientras se calcula el monto real del rango antes de
  // mostrar el confirm (ver fetchMontoPeriodo) — es lo que deshabilita el botón que se tocó.
  const [calculando, setCalculando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [cargandoColilla, setCargandoColilla] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoGenerar, setConfirmandoGenerar] = useState<{
    comision: ComisionPendiente
    periodicidad: Periodicidad
    periodoInicio: string
    periodoFin: string
    preview: MontoPeriodo
    // Presente solo cuando se genera desde el reporte por periodo (PeriodoSelector) en vez de
    // los botones rápidos diaria/semanal — reemplaza la frase "de hoy"/"de los últimos 7 días"
    // del mensaje de confirmación por la etiqueta real del periodo elegido (ej. "Semana 18 – 24 ago").
    rangoLabel?: string
  } | null>(null)
  const [confirmandoPago, setConfirmandoPago] = useState<Liquidacion | null>(null)
  const [colilla, setColilla] = useState<ColillaLiquidacionData | null>(null)

  // Jefe de patio (comisión nueva, 3% configurable) — mismo flujo que lavadores arriba, pero
  // keyed por `responsable` (texto libre, ver src/data/liquidacionesJefeZona.ts) en vez de un id.
  const [pendientesJefeZona, setPendientesJefeZona] = useState(initial.pendientesJefeZona)
  const [historicoJefeZona, setHistoricoJefeZona] = useState(initial.historicoJefeZona)
  const [generandoJefeZona, setGenerandoJefeZona] = useState<string | null>(null)
  const [calculandoJefeZona, setCalculandoJefeZona] = useState<string | null>(null)
  const [pagandoJefeZona, setPagandoJefeZona] = useState<string | null>(null)
  const [cargandoColillaJefeZona, setCargandoColillaJefeZona] = useState<string | null>(null)
  const [confirmandoGenerarJefeZona, setConfirmandoGenerarJefeZona] = useState<{
    comision: ComisionPendienteJefeZona
    periodicidad: Periodicidad
    periodoInicio: string
    periodoFin: string
    preview: MontoPeriodoJefeZona
    rangoLabel?: string
  } | null>(null)
  const [confirmandoPagoJefeZona, setConfirmandoPagoJefeZona] = useState<LiquidacionJefeZona | null>(null)
  const [colillaJefeZona, setColillaJefeZona] = useState<ColillaJefeZonaData | null>(null)

  // Lavadores y jefe de patio son el MISMO flujo (pendientes → generar diaria/semanal → colilla →
  // marcar pagada) con distinto sujeto; antes vivían como cuatro secciones apiladas en esta misma
  // página, que obligaba a bajar por dos históricos para llegar al segundo. Con el selector se ve
  // un flujo completo a la vez. Los montos pendientes de ambos siguen visibles juntos en el
  // dashboard, que es donde tiene sentido compararlos.
  const [sujeto, setSujeto] = useState<'lavadores' | 'jefe_zona'>('lavadores')
  const totalPendienteLavadores = pendientes.reduce((suma, c) => suma + c.montoPendiente, 0)
  const totalPendienteJefeZona = pendientesJefeZona.reduce((suma, c) => suma + c.montoPendiente, 0)

  // Reporte por periodo (día/semana/mes) — complementa las tarjetas de "acumulado total sin
  // liquidar" de arriba (que no tienen fecha) con una vista navegable de cuánto se generó y
  // cuánto de eso sigue pendiente en un rango específico, más el histórico que cae en ese mismo
  // rango. Mismo estado sirve para ambos sujetos (lavadores/jefe de patio), solo cambia qué
  // función de resumen se llama.
  const [modoPeriodo, setModoPeriodo] = useState<ModoPeriodo>('semana')
  const [anclaPeriodo, setAnclaPeriodo] = useState(() => new Date())
  const rangoPeriodo = calcularRango(modoPeriodo, anclaPeriodo)
  const [resumenLavadores, setResumenLavadores] = useState<ResumenPeriodoLavador[]>([])
  const [resumenJefeZona, setResumenJefeZona] = useState<ResumenPeriodoJefeZona[]>([])
  // Se marca "cargando" desde los propios manejadores de clic (cambiarModoPeriodo/cambiarAnclaPeriodo/
  // cambiarSujeto abajo), no de forma síncrona dentro del efecto — evita el cascading-render que
  // marca react-hooks/set-state-in-effect cuando el setState corre en el cuerpo del efecto en vez
  // de en respuesta a un evento real del usuario.
  const [cargandoResumen, setCargandoResumen] = useState(false)

  function cambiarModoPeriodo(modo: ModoPeriodo) {
    setCargandoResumen(true)
    setModoPeriodo(modo)
  }
  function cambiarAnclaPeriodo(ancla: Date) {
    setCargandoResumen(true)
    setAnclaPeriodo(ancla)
  }
  function cambiarSujeto(value: 'lavadores' | 'jefe_zona') {
    setCargandoResumen(true)
    setSujeto(value)
  }

  useEffect(() => {
    let cancelado = false
    const cargar =
      sujeto === 'lavadores'
        ? fetchResumenPeriodoLavadores(rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin).then((r) => {
            if (!cancelado) setResumenLavadores(r)
          })
        : fetchResumenPeriodoJefeZona(rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin).then((r) => {
            if (!cancelado) setResumenJefeZona(r)
          })
    cargar.finally(() => {
      if (!cancelado) setCargandoResumen(false)
    })
    return () => {
      cancelado = true
    }
  }, [sujeto, rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin])

  // Histórico de liquidaciones cuyo periodo se solapa con el rango navegado — misma condición de
  // overlap que usan los calendarios (inicioA <= finB && finA >= inicioB).
  const historicoEnPeriodo = historico.filter(
    (l) => l.periodoInicio <= rangoPeriodo.periodoFin && l.periodoFin >= rangoPeriodo.periodoInicio,
  )
  const historicoJefeZonaEnPeriodo = historicoJefeZona.filter(
    (l) => l.periodoInicio <= rangoPeriodo.periodoFin && l.periodoFin >= rangoPeriodo.periodoInicio,
  )
  const totalLiquidadoEnPeriodo = historicoEnPeriodo.reduce((suma, l) => suma + l.monto, 0)
  const totalLiquidadoJefeZonaEnPeriodo = historicoJefeZonaEnPeriodo.reduce((suma, l) => suma + l.monto, 0)

  // Tras generar una liquidación (desde cualquiera de los dos flujos), el reporte por periodo
  // queda desactualizado — refresh() ya recarga pendientes/histórico, esto recarga el resumen.
  async function refreshResumen() {
    if (sujeto === 'lavadores') {
      setResumenLavadores(await fetchResumenPeriodoLavadores(rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin))
    } else {
      setResumenJefeZona(await fetchResumenPeriodoJefeZona(rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin))
    }
  }

  async function handleGenerarDesdeReporte(resumen: ResumenPeriodoLavador) {
    setError(null)
    const key = `${resumen.lavadorId}:reporte`
    setCalculando(key)
    try {
      const preview = await fetchMontoPeriodo(resumen.lavadorId, rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin, tiposVehiculo, combos)
      setConfirmandoGenerar({
        comision: { lavadorId: resumen.lavadorId, lavadorNombre: resumen.lavadorNombre, montoPendiente: resumen.montoPendiente, cantidadOrdenes: resumen.cantidadOrdenes },
        periodicidad: 'semanal',
        periodoInicio: rangoPeriodo.periodoInicio,
        periodoFin: rangoPeriodo.periodoFin,
        preview,
        rangoLabel: rangoPeriodo.label,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculando(null)
    }
  }

  async function handleGenerarDesdeReporteJefeZona(resumen: ResumenPeriodoJefeZona) {
    setError(null)
    const key = `${resumen.responsable}:reporte`
    setCalculandoJefeZona(key)
    try {
      const preview = await fetchMontoPeriodoJefeZona(resumen.responsable, rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin)
      setConfirmandoGenerarJefeZona({
        comision: { responsable: resumen.responsable, montoPendiente: resumen.montoPendiente, cantidadOrdenes: resumen.cantidadOrdenes },
        periodicidad: 'semanal',
        periodoInicio: rangoPeriodo.periodoInicio,
        periodoFin: rangoPeriodo.periodoFin,
        preview,
        rangoLabel: rangoPeriodo.label,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculandoJefeZona(null)
    }
  }

  const lavadoresPorId = new Map(lavadores.map((l) => [l.id, l] as const))

  async function refresh() {
    const data = await loadData()
    setPendientes(data.pendientes)
    setHistorico(data.historico)
    setLavadores(data.lavadores)
    setConfiguracion(data.configuracion)
    setPendientesJefeZona(data.pendientesJefeZona)
    setHistoricoJefeZona(data.historicoJefeZona)
    router.invalidate()
  }

  // Reutilizable para "recién generada" (handleGenerar) y para reimprimir desde el histórico
  // (handleVerColilla) — el desglose siempre sale de `ordenes.liquidacion_id`, exacto a lo que
  // quedó liquidado de verdad, no del rango de fechas.
  async function abrirColilla(liquidacion: Liquidacion, lavadorNombre: string) {
    const desglose = await fetchDesgloseLiquidacion(liquidacion.id, tiposVehiculo, combos)
    setColilla({
      lavadorNombre,
      periodoInicio: liquidacion.periodoInicio,
      periodoFin: liquidacion.periodoFin,
      desglose,
      monto: liquidacion.monto,
      generadaEn: liquidacion.creadoEn,
    })
  }

  async function handleVerColilla(liquidacion: Liquidacion) {
    setCargandoColilla(liquidacion.id)
    try {
      await abrirColilla(liquidacion, lavadoresPorId.get(liquidacion.lavadorId)?.nombre ?? '—')
    } finally {
      setCargandoColilla(null)
    }
  }

  // El monto de la tarjeta (`comision.montoPendiente`) es el acumulado TOTAL sin liquidar, no lo
  // que cae dentro de "hoy" o "últimos 7 días" — por eso se calcula el monto real del rango
  // elegido antes de confirmar, en vez de mostrar esa cifra como si fuera lo que se va a generar.
  async function handleElegirPeriodicidad(comision: ComisionPendiente, periodicidad: Periodicidad) {
    setError(null)
    setCalculando(`${comision.lavadorId}:${periodicidad}`)
    try {
      const [periodoInicio, periodoFin] = rangoPorPeriodicidad(periodicidad)
      const preview = await fetchMontoPeriodo(comision.lavadorId, periodoInicio, periodoFin, tiposVehiculo, combos)
      if (preview.cantidadOrdenes === 0) {
        setError(
          `${comision.lavadorNombre} no tiene órdenes sin liquidar en ${
            periodicidad === 'diaria' ? 'el día de hoy' : 'los últimos 7 días'
          } — nada que generar en ese rango.`,
        )
        return
      }
      setConfirmandoGenerar({ comision, periodicidad, periodoInicio, periodoFin, preview })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculando(null)
    }
  }

  async function handleGenerar() {
    if (!confirmandoGenerar) return
    const { comision, periodoInicio, periodoFin } = confirmandoGenerar
    setError(null)
    setGenerando(comision.lavadorId)
    try {
      const liquidacion = await generarLiquidacion(comision.lavadorId, periodoInicio, periodoFin)
      await refresh()
      await refreshResumen()
      await abrirColilla(liquidacion, comision.lavadorNombre)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la liquidación')
    } finally {
      setGenerando(null)
      setConfirmandoGenerar(null)
    }
  }

  async function handleMarcarPagada(liquidacion: Liquidacion) {
    setPagando(liquidacion.id)
    try {
      await marcarLiquidacionPagada(liquidacion.id)
      await refresh()
    } finally {
      setPagando(null)
    }
  }

  async function handleElegirPeriodicidadJefeZona(comision: ComisionPendienteJefeZona, periodicidad: Periodicidad) {
    setError(null)
    setCalculandoJefeZona(`${comision.responsable}:${periodicidad}`)
    try {
      const [periodoInicio, periodoFin] = rangoPorPeriodicidad(periodicidad)
      const preview = await fetchMontoPeriodoJefeZona(comision.responsable, periodoInicio, periodoFin)
      if (preview.cantidadOrdenes === 0) {
        setError(
          `${comision.responsable} no tiene órdenes sin liquidar en ${
            periodicidad === 'diaria' ? 'el día de hoy' : 'los últimos 7 días'
          } — nada que generar en ese rango.`,
        )
        return
      }
      setConfirmandoGenerarJefeZona({ comision, periodicidad, periodoInicio, periodoFin, preview })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculandoJefeZona(null)
    }
  }

  async function handleGenerarJefeZona() {
    if (!confirmandoGenerarJefeZona) return
    const { comision, periodoInicio, periodoFin } = confirmandoGenerarJefeZona
    setError(null)
    setGenerandoJefeZona(comision.responsable)
    try {
      const liquidacion = await generarLiquidacionJefeZona(comision.responsable, periodoInicio, periodoFin)
      await refresh()
      await refreshResumen()
      setColillaJefeZona({
        responsable: comision.responsable,
        periodoInicio: liquidacion.periodoInicio,
        periodoFin: liquidacion.periodoFin,
        cantidadOrdenes: confirmandoGenerarJefeZona.preview.cantidadOrdenes,
        monto: liquidacion.monto,
        generadaEn: liquidacion.creadoEn,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la liquidación')
    } finally {
      setGenerandoJefeZona(null)
      setConfirmandoGenerarJefeZona(null)
    }
  }

  async function handleMarcarPagadaJefeZona(liquidacion: LiquidacionJefeZona) {
    setPagandoJefeZona(liquidacion.id)
    try {
      await marcarLiquidacionJefeZonaPagada(liquidacion.id)
      await refresh()
    } finally {
      setPagandoJefeZona(null)
    }
  }

  async function handleVerColillaJefeZona(liquidacion: LiquidacionJefeZona) {
    setCargandoColillaJefeZona(liquidacion.id)
    try {
      const cantidadOrdenes = await fetchCantidadOrdenesLiquidacionJefeZona(liquidacion.id)
      setColillaJefeZona({
        responsable: liquidacion.responsable,
        periodoInicio: liquidacion.periodoInicio,
        periodoFin: liquidacion.periodoFin,
        cantidadOrdenes,
        monto: liquidacion.monto,
        generadaEn: liquidacion.creadoEn,
      })
    } finally {
      setCargandoColillaJefeZona(null)
    }
  }

  return (
    <div className="flex flex-col gap-8 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Liquidaciones</h2>
        <p className="text-sm text-neutral-500">
          Sobre el acumulado, sin descuentos (regla de negocio 4) — genera diaria o semanal para quien sea; la
          periodicidad marcada como default ({periodicidadLabel}) se define en{' '}
          <span className="font-medium text-neutral-700">Configuración</span>, junto con los porcentajes de comisión.
          Cuenta el trabajo del día sin importar si el lavado ya terminó o si el cliente ya pagó — solo se excluyen
          las órdenes anuladas.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:max-w-lg">
        {(
          [
            { value: 'lavadores' as const, label: 'Lavadores', total: totalPendienteLavadores, icon: Wallet },
            { value: 'jefe_zona' as const, label: 'Jefe de patio', total: totalPendienteJefeZona, icon: ShieldCheck },
          ]
        ).map(({ value, label, total, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => cambiarSujeto(value)}
            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              sujeto === value
                ? 'border-primary-600 bg-primary-50'
                : 'border-neutral-200 bg-white hover:bg-neutral-50'
            }`}
          >
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${
                sujeto === value ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              <Icon size={16} strokeWidth={2} />
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm font-medium ${sujeto === value ? 'text-primary-700' : 'text-neutral-700'}`}
              >
                {label}
              </span>
              <span className="block text-xs text-neutral-500">{COP.format(total)} pendiente</span>
            </span>
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Reporte por periodo</h3>
          <PeriodoSelector modo={modoPeriodo} onModoChange={cambiarModoPeriodo} ancla={anclaPeriodo} onAnclaChange={cambiarAnclaPeriodo} rango={rangoPeriodo} />
        </div>
        <p className="-mt-1 text-xs text-neutral-500">
          Navega cualquier día, semana o mes — no solo "hoy" o "últimos 7 días". Muestra lo generado en ese rango
          (liquidado o no) junto con lo ya liquidado que cae ahí, para comparar.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label={`Generado en ${rangoPeriodo.label}`}
            value={COP.format(
              sujeto === 'lavadores'
                ? resumenLavadores.reduce((s, r) => s + r.montoTotal, 0)
                : resumenJefeZona.reduce((s, r) => s + r.montoTotal, 0),
            )}
            hint={cargandoResumen ? 'Calculando…' : undefined}
            icon={Wallet}
          />
          <StatCard
            label={`Ya liquidado en ${rangoPeriodo.label}`}
            value={COP.format(sujeto === 'lavadores' ? totalLiquidadoEnPeriodo : totalLiquidadoJefeZonaEnPeriodo)}
            hint={`${sujeto === 'lavadores' ? historicoEnPeriodo.length : historicoJefeZonaEnPeriodo.length} liquidación(es) en este rango`}
            icon={CheckCircle2}
          />
        </div>

        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">{sujeto === 'lavadores' ? 'Lavador' : 'Responsable'}</th>
                <th className="px-5 py-3">Órdenes</th>
                <th className="px-5 py-3">Generado</th>
                <th className="px-5 py-3">Pendiente</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {sujeto === 'lavadores'
                ? resumenLavadores.map((r) => (
                    <tr key={r.lavadorId} className="border-b border-neutral-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-neutral-900">{r.lavadorNombre}</td>
                      <td className="px-5 py-3 text-neutral-600">{r.cantidadOrdenes}</td>
                      <td className="px-5 py-3 text-neutral-700">{COP.format(r.montoTotal)}</td>
                      <td className="px-5 py-3 text-neutral-700">{COP.format(r.montoPendiente)}</td>
                      <td className="px-5 py-3 text-right">
                        {r.montoPendiente > 0 ? (
                          <button
                            type="button"
                            disabled={calculando === `${r.lavadorId}:reporte` || generando === r.lavadorId}
                            onClick={() => handleGenerarDesdeReporte(r)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
                          >
                            {calculando === `${r.lavadorId}:reporte` ? 'Calculando…' : 'Generar de este periodo'}
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-400">Al día</span>
                        )}
                      </td>
                    </tr>
                  ))
                : resumenJefeZona.map((r) => (
                    <tr key={r.responsable} className="border-b border-neutral-100 last:border-0">
                      <td className="px-5 py-3 font-medium text-neutral-900">{r.responsable}</td>
                      <td className="px-5 py-3 text-neutral-600">{r.cantidadOrdenes}</td>
                      <td className="px-5 py-3 text-neutral-700">{COP.format(r.montoTotal)}</td>
                      <td className="px-5 py-3 text-neutral-700">{COP.format(r.montoPendiente)}</td>
                      <td className="px-5 py-3 text-right">
                        {r.montoPendiente > 0 ? (
                          <button
                            type="button"
                            disabled={calculandoJefeZona === `${r.responsable}:reporte` || generandoJefeZona === r.responsable}
                            onClick={() => handleGenerarDesdeReporteJefeZona(r)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-50"
                          >
                            {calculandoJefeZona === `${r.responsable}:reporte` ? 'Calculando…' : 'Generar de este periodo'}
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-400">Al día</span>
                        )}
                      </td>
                    </tr>
                  ))}
              {(sujeto === 'lavadores' ? resumenLavadores.length : resumenJefeZona.length) === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-neutral-400" colSpan={5}>
                    {cargandoResumen ? 'Cargando…' : `Nada generado en ${rangoPeriodo.label}.`}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>
      </section>

      {sujeto === 'lavadores' ? (
        <>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Comisiones pendientes</h3>
          {pendientes.length === 0 ? (
            <Card className="py-8 text-center text-sm text-neutral-400">
              No hay lavadores activos con comisiones pendientes por liquidar.
            </Card>
          ) : (
            <>
              {pendientes.length > 2 ? (
                <Card className="text-left">
                  <h4 className="mb-3 text-sm font-semibold text-neutral-900">Comparativo por lavador</h4>
                  <BarChart
                    labels={pendientes.map((c) => c.lavadorNombre)}
                    data={pendientes.map((c) => c.montoPendiente)}
                    valueFormatter={COP.format}
                    height={Math.max(120, pendientes.length * 40)}
                  />
                </Card>
              ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendientes.map((comision) => (
                <Card key={comision.lavadorId} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                      <Wallet size={18} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {comision.lavadorNombre}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {comision.cantidadOrdenes} orden{comision.cantidadOrdenes === 1 ? '' : 'es'} sin liquidar
                      </p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-neutral-900">{COP.format(comision.montoPendiente)}</p>
                  <p className="-mt-2 text-xs text-neutral-400">Acumulado total sin liquidar — no es lo que cae en cada rango de abajo.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['diaria', 'semanal'] as const).map((periodicidad) => {
                      const key = `${comision.lavadorId}:${periodicidad}`
                      const esDefault = periodicidad === configuracion.periodicidadLiquidacion
                      return (
                        <button
                          key={periodicidad}
                          type="button"
                          disabled={comision.montoPendiente === 0 || calculando === key || generando === comision.lavadorId}
                          onClick={() => handleElegirPeriodicidad(comision, periodicidad)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            esDefault
                              ? 'bg-primary-600 text-white shadow-nav-active hover:bg-primary-700'
                              : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          {calculando === key ? 'Calculando…' : `Generar ${periodicidad}`}
                        </button>
                      )
                    })}
                  </div>
                </Card>
              ))}
            </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Histórico de liquidaciones</h3>
          {/* Conteo de liquidaciones ya generadas — "pendiente de pago" (generada, esperando que
              el admin le pague al lavador) vs "pagada" (marcarLiquidacionPagada ya ejecutado). No
              confundir con "Comisiones pendientes" arriba: eso es trabajo sin liquidación generada
              todavía; esto es liquidaciones que sí se generaron y su estado de pago real. */}
          {historico.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="En proceso de pago"
                value={String(historico.filter((l) => !l.pagada).length)}
                hint={COP.format(historico.filter((l) => !l.pagada).reduce((s, l) => s + l.monto, 0))}
                icon={Clock}
              />
              <StatCard
                label="Pagadas"
                value={String(historico.filter((l) => l.pagada).length)}
                hint={COP.format(historico.filter((l) => l.pagada).reduce((s, l) => s + l.monto, 0))}
                icon={CheckCircle2}
              />
            </div>
          ) : null}
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-5 py-3">Lavador</th>
                  <th className="px-5 py-3">Tipo y fecha</th>
                  <th className="px-5 py-3">Monto</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((liquidacion) => (
                  <LiquidacionRow
                    key={liquidacion.id}
                    liquidacion={liquidacion}
                    lavador={lavadoresPorId.get(liquidacion.lavadorId)}
                    pagando={pagando === liquidacion.id}
                    cargandoColilla={cargandoColilla === liquidacion.id}
                    onMarcarPagada={() => setConfirmandoPago(liquidacion)}
                    onVerColilla={() => handleVerColilla(liquidacion)}
                  />
                ))}
                {historico.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-center text-neutral-400" colSpan={5}>
                      Todavía no se ha generado ninguna liquidación.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </section>
        </>
      ) : (
        <>
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Comisiones pendientes</h3>
          <p className="-mt-1 text-xs text-neutral-500">
            {(configuracion.comisionJefeZonaPorcentaje * 100).toFixed(0)}% de cada orden para quien estuvo a cargo del
            turno de recepción al registrarla — identificado por el nombre del responsable del turno, no por un usuario
            con id propio todavía.
          </p>
          {pendientesJefeZona.length === 0 ? (
            <Card className="py-8 text-center text-sm text-neutral-400">
              No hay responsables con comisión de jefe de patio pendiente por liquidar.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pendientesJefeZona.map((comision) => (
                <Card key={comision.responsable} className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                      <ShieldCheck size={18} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">{comision.responsable}</p>
                      <p className="text-xs text-neutral-500">
                        {comision.cantidadOrdenes} orden{comision.cantidadOrdenes === 1 ? '' : 'es'} sin liquidar
                      </p>
                    </div>
                  </div>
                  <p className="text-xl font-semibold text-neutral-900">{COP.format(comision.montoPendiente)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['diaria', 'semanal'] as const).map((periodicidad) => {
                      const key = `${comision.responsable}:${periodicidad}`
                      const esDefault = periodicidad === configuracion.periodicidadLiquidacion
                      return (
                        <button
                          key={periodicidad}
                          type="button"
                          disabled={
                            comision.montoPendiente === 0 ||
                            calculandoJefeZona === key ||
                            generandoJefeZona === comision.responsable
                          }
                          onClick={() => handleElegirPeriodicidadJefeZona(comision, periodicidad)}
                          className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            esDefault
                              ? 'bg-primary-600 text-white shadow-nav-active hover:bg-primary-700'
                              : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                          }`}
                        >
                          {calculandoJefeZona === key ? 'Calculando…' : `Generar ${periodicidad}`}
                        </button>
                      )
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-neutral-900">Histórico de liquidaciones</h3>
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                  <th className="px-5 py-3">Responsable</th>
                  <th className="px-5 py-3">Tipo y fecha</th>
                  <th className="px-5 py-3">Monto</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historicoJefeZona.map((liquidacion) => (
                  <LiquidacionJefeZonaRow
                    key={liquidacion.id}
                    liquidacion={liquidacion}
                    pagando={pagandoJefeZona === liquidacion.id}
                    cargandoColilla={cargandoColillaJefeZona === liquidacion.id}
                    onMarcarPagada={() => setConfirmandoPagoJefeZona(liquidacion)}
                    onVerColilla={() => handleVerColillaJefeZona(liquidacion)}
                  />
                ))}
                {historicoJefeZona.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-center text-neutral-400" colSpan={5}>
                      Todavía no se ha generado ninguna liquidación de jefe de patio.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </Card>
        </section>
        </>
      )}

      {confirmandoGenerar ? (
        <ConfirmModal
          title={confirmandoGenerar.rangoLabel ? `Generar liquidación — ${confirmandoGenerar.rangoLabel}` : `Generar liquidación ${confirmandoGenerar.periodicidad}`}
          message={`¿Generar la liquidación ${
            confirmandoGenerar.rangoLabel
              ? `de ${confirmandoGenerar.rangoLabel}`
              : confirmandoGenerar.periodicidad === 'diaria'
                ? 'de hoy'
                : 'de los últimos 7 días'
          } (${confirmandoGenerar.periodoInicio} → ${confirmandoGenerar.periodoFin}) para ${
            confirmandoGenerar.comision.lavadorNombre
          } por ${COP.format(confirmandoGenerar.preview.monto)}? Carros: ${
            confirmandoGenerar.preview.desglose.autos.cantidad
          } (${COP.format(confirmandoGenerar.preview.desglose.autos.monto)}) · Motos: ${
            confirmandoGenerar.preview.desglose.motos.cantidad
          } (${COP.format(confirmandoGenerar.preview.desglose.motos.monto)}).`}
          confirmLabel="Generar liquidación"
          variant="primary"
          onConfirm={handleGenerar}
          onCancel={() => setConfirmandoGenerar(null)}
        />
      ) : null}

      {colilla ? <ColillaLiquidacionModal colilla={colilla} onClose={() => setColilla(null)} /> : null}

      {confirmandoPago ? (
        <ConfirmModal
          title="Marcar liquidación como pagada"
          message={`¿Marcar como pagada la liquidación de ${lavadoresPorId.get(confirmandoPago.lavadorId)?.nombre ?? '—'} por ${COP.format(confirmandoPago.monto)}?`}
          confirmLabel="Marcar pagada"
          variant="primary"
          onConfirm={async () => {
            await handleMarcarPagada(confirmandoPago)
            setConfirmandoPago(null)
          }}
          onCancel={() => setConfirmandoPago(null)}
        />
      ) : null}

      {confirmandoGenerarJefeZona ? (
        <ConfirmModal
          title={confirmandoGenerarJefeZona.rangoLabel ? `Generar liquidación — ${confirmandoGenerarJefeZona.rangoLabel}` : `Generar liquidación ${confirmandoGenerarJefeZona.periodicidad}`}
          message={`¿Generar la liquidación ${
            confirmandoGenerarJefeZona.rangoLabel
              ? `de ${confirmandoGenerarJefeZona.rangoLabel}`
              : confirmandoGenerarJefeZona.periodicidad === 'diaria'
                ? 'de hoy'
                : 'de los últimos 7 días'
          } (${confirmandoGenerarJefeZona.periodoInicio} → ${confirmandoGenerarJefeZona.periodoFin}) para ${
            confirmandoGenerarJefeZona.comision.responsable
          } por ${COP.format(confirmandoGenerarJefeZona.preview.monto)} (${
            confirmandoGenerarJefeZona.preview.cantidadOrdenes
          } orden${confirmandoGenerarJefeZona.preview.cantidadOrdenes === 1 ? '' : 'es'})?`}
          confirmLabel="Generar liquidación"
          variant="primary"
          onConfirm={handleGenerarJefeZona}
          onCancel={() => setConfirmandoGenerarJefeZona(null)}
        />
      ) : null}

      {colillaJefeZona ? <ColillaJefeZonaModal colilla={colillaJefeZona} onClose={() => setColillaJefeZona(null)} /> : null}

      {confirmandoPagoJefeZona ? (
        <ConfirmModal
          title="Marcar liquidación como pagada"
          message={`¿Marcar como pagada la liquidación de ${confirmandoPagoJefeZona.responsable} por ${COP.format(confirmandoPagoJefeZona.monto)}?`}
          confirmLabel="Marcar pagada"
          variant="primary"
          onConfirm={async () => {
            await handleMarcarPagadaJefeZona(confirmandoPagoJefeZona)
            setConfirmandoPagoJefeZona(null)
          }}
          onCancel={() => setConfirmandoPagoJefeZona(null)}
        />
      ) : null}
    </div>
  )
}

function LiquidacionJefeZonaRow({
  liquidacion,
  pagando,
  cargandoColilla,
  onMarcarPagada,
  onVerColilla,
}: {
  liquidacion: LiquidacionJefeZona
  pagando: boolean
  cargandoColilla: boolean
  onMarcarPagada: () => void
  onVerColilla: () => void
}) {
  const esDiaria = liquidacion.periodoInicio === liquidacion.periodoFin
  return (
    <tr className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
      <td className="px-5 py-3 font-medium text-neutral-900">{liquidacion.responsable}</td>
      <td className="px-5 py-3 text-neutral-600">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              esDiaria ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {esDiaria ? 'Diaria' : 'Semanal'}
          </span>
          <span>
            {esDiaria
              ? FECHA.format(new Date(`${liquidacion.periodoInicio}T00:00:00`))
              : `${FECHA.format(new Date(`${liquidacion.periodoInicio}T00:00:00`))} → ${FECHA.format(new Date(`${liquidacion.periodoFin}T00:00:00`))}`}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-400">Generada {FECHA_HORA.format(new Date(liquidacion.creadoEn))}</p>
      </td>
      <td className="px-5 py-3 text-neutral-900">{COP.format(liquidacion.monto)}</td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            liquidacion.pagada ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
          }`}
        >
          {liquidacion.pagada ? 'Pagada' : 'En proceso de pago'}
        </span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={cargandoColilla}
            onClick={onVerColilla}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700 disabled:opacity-50"
          >
            <Receipt size={14} />
            {cargandoColilla ? 'Cargando…' : 'Colilla'}
          </button>
          {liquidacion.pagada ? (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <CheckCircle2 size={14} />
              {liquidacion.pagadaEn ? new Date(liquidacion.pagadaEn).toLocaleDateString('es-CO') : ''}
            </span>
          ) : (
            <button
              type="button"
              disabled={pagando}
              onClick={onMarcarPagada}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700 disabled:opacity-50"
            >
              {pagando ? 'Guardando…' : 'Marcar pagada'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

function LiquidacionRow({
  liquidacion,
  lavador,
  pagando,
  cargandoColilla,
  onMarcarPagada,
  onVerColilla,
}: {
  liquidacion: Liquidacion
  lavador: Lavador | undefined
  pagando: boolean
  cargandoColilla: boolean
  onMarcarPagada: () => void
  onVerColilla: () => void
}) {
  // periodoInicio === periodoFin es exactamente el criterio que usa rangoPorPeriodicidad al
  // generar (diaria = un solo día) — así que sirve para etiquetar cada fila sin guardar un campo
  // "tipo" aparte. La hora de generación (creadoEn) es lo que distingue dos diarias del MISMO día
  // si el admin liquidó más de una vez esa fecha (regla de negocio 4: se puede, cada corte es su
  // propia liquidación con lo que estuviera pendiente en ese momento).
  const esDiaria = liquidacion.periodoInicio === liquidacion.periodoFin
  return (
    <tr className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
      <td className="px-5 py-3 font-medium text-neutral-900">{lavador?.nombre ?? '—'}</td>
      <td className="px-5 py-3 text-neutral-600">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
              esDiaria ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {esDiaria ? 'Diaria' : 'Semanal'}
          </span>
          <span>
            {esDiaria
              ? FECHA.format(new Date(`${liquidacion.periodoInicio}T00:00:00`))
              : `${FECHA.format(new Date(`${liquidacion.periodoInicio}T00:00:00`))} → ${FECHA.format(new Date(`${liquidacion.periodoFin}T00:00:00`))}`}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-neutral-400">Generada {FECHA_HORA.format(new Date(liquidacion.creadoEn))}</p>
      </td>
      <td className="px-5 py-3 text-neutral-900">{COP.format(liquidacion.monto)}</td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            liquidacion.pagada ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
          }`}
        >
          {liquidacion.pagada ? 'Pagada' : 'En proceso de pago'}
        </span>
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={cargandoColilla}
            onClick={onVerColilla}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700 disabled:opacity-50"
          >
            <Receipt size={14} />
            {cargandoColilla ? 'Cargando…' : 'Colilla'}
          </button>
          {liquidacion.pagada ? (
            <span className="flex items-center gap-1 text-xs text-neutral-400">
              <CheckCircle2 size={14} />
              {liquidacion.pagadaEn ? new Date(liquidacion.pagadaEn).toLocaleDateString('es-CO') : ''}
            </span>
          ) : (
            <button
              type="button"
              disabled={pagando}
              onClick={onMarcarPagada}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700 disabled:opacity-50"
            >
              {pagando ? 'Guardando…' : 'Marcar pagada'}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
