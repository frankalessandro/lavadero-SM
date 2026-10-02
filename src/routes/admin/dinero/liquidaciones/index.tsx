import { useEffect, useMemo, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Wallet, CheckCircle2, Receipt, ShieldCheck, Ban, HandCoins, Inbox, UserRound } from 'lucide-react'
import {
  fetchComisionesPendientes,
  fetchLiquidaciones,
  fetchMontoPeriodo,
  fetchDesgloseLiquidacion,
  fetchDeudaTrasLiquidacion,
  fetchResumenPeriodoLavadores,
  generarLiquidacion,
  marcarLiquidacionPagada,
  anularLiquidacion,
  type MontoPeriodo,
  type ResumenPeriodoLavador,
} from '../../../../data/liquidaciones'
import {
  fetchComisionesPendientesJefeZona,
  fetchLiquidacionesJefeZona,
  fetchMontoPeriodoJefeZona,
  fetchOrdenesPendientesJefeZona,
  fetchCantidadOrdenesLiquidacionJefeZona,
  fetchResumenPeriodoJefeZona,
  generarLiquidacionJefeZona,
  marcarLiquidacionJefeZonaPagada,
  anularLiquidacionJefeZona,
  type ComisionPendienteJefeZona,
  type MontoPeriodoJefeZona,
  type ResumenPeriodoJefeZona,
} from '../../../../data/liquidacionesJefeZona'
import { PeriodoSelector } from '../../../../components/layout/PeriodoSelector'
import { calcularRango, fechaLocalISO, type ModoPeriodo } from '../../../../lib/periodo'
import { fetchLavadores } from '../../../../data/lavadores'
import { fetchTurnoAbierto } from '../../../../data/turnos'
import { fetchPrestamosDeTurno, type DeudaPersonal } from '../../../../data/deudasPersonal'
import { fetchConfiguracion } from '../../../../data/configuracion'
import { fetchTiposVehiculo } from '../../../../data/tiposVehiculo'
import { fetchCombos } from '../../../../data/combos'
import type { ComisionPendiente } from '../../../../data/liquidaciones'
import type { Liquidacion } from '../../../../schemas/liquidacion'
import type { LiquidacionJefeZona } from '../../../../schemas/liquidacionJefeZona'
import type { Configuracion } from '../../../../schemas/configuracion'
import { Card } from '../../../../components/layout/Card'
import { coincide } from '../../../../lib/tableFilters'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { GenerarLiquidacionModal } from '../../../../components/layout/GenerarLiquidacionModal'
import { ColillaLiquidacionModal, type ColillaLiquidacionData } from '../../../../components/layout/ColillaLiquidacionModal'
import { PrestamosDeTurno } from '../../../../components/layout/PrestamosDeTurno'
import { ColillaJefeZonaModal, type ColillaJefeZonaData } from '../../../../components/layout/ColillaJefeZonaModal'
import {
  DetalleOrdenesJefeZonaModal,
  type DetalleOrdenJefeZonaFila,
} from '../../../../components/layout/DetalleOrdenesJefeZonaModal'
import { toast } from '../../../../lib/toast'
import { Modal } from '../../../../components/layout/Modal'
import { BarraFiltros, FiltroCombo, FiltroMenu } from '../../../../components/layout/Filtros'
import { Button } from '../../../../components/layout/Button'
import { PageHeader, SectionHeader } from '../../../../components/layout/PageHeader'

// Texto del botón de colilla informativa según el filtro de periodo: "Colilla del día", etc.
const COLILLA_DE: Record<ModoPeriodo, string> = { dia: 'del día', semana: 'de la semana', mes: 'del mes' }

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' })

// Fecha LOCAL (no `toISOString`, que es UTC): en Colombia, desde las 7 p. m. UTC ya es "mañana" y
// la diaria/colilla "de hoy" salía del día siguiente, vacía.
function hoyISO(offsetDias = 0): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + offsetDias)
  return fechaLocalISO(fecha)
}

async function loadData() {
  const [pendientes, historico, lavadores, configuracion, tiposVehiculo, combos, pendientesJefeZona, historicoJefeZona, turnoJefeZona] =
    await Promise.all([
      fetchComisionesPendientes(),
      fetchLiquidaciones(),
      fetchLavadores(),
      fetchConfiguracion(),
      fetchTiposVehiculo(),
      fetchCombos(),
      fetchComisionesPendientesJefeZona(),
      fetchLiquidacionesJefeZona(),
      fetchTurnoAbierto('jefe_zona'),
    ])
  // Préstamos de la caja del turno abierto (0065) — igual criterio que las compras: solo tiene
  // sentido si hay turno abierto ahora mismo (admin no abre turno, pero la única caja que presta
  // es la de jefe de zona).
  const prestamosTurno = turnoJefeZona ? await fetchPrestamosDeTurno(turnoJefeZona.id) : []
  return {
    pendientes,
    historico,
    lavadores,
    configuracion,
    tiposVehiculo,
    combos,
    pendientesJefeZona,
    historicoJefeZona,
    turnoJefeZona,
    prestamosTurno,
  }
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
  const [turnoJefeZona, setTurnoJefeZona] = useState(initial.turnoJefeZona)
  const [prestamosTurno, setPrestamosTurno] = useState<DeudaPersonal[]>(initial.prestamosTurno)
  const periodicidadLabel = configuracion.periodicidadLiquidacion === 'diaria' ? 'diaria' : 'semanal'
  const [generando, setGenerando] = useState<string | null>(null)
  // Clave `${lavadorId}:${periodicidad}` mientras se calcula el monto real del rango antes de
  // mostrar el confirm (ver fetchMontoPeriodo) — es lo que deshabilita el botón que se tocó.
  const [calculando, setCalculando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [cargandoColilla, setCargandoColilla] = useState<string | null>(null)
  // "Colilla del día" (2026-09-14): corte informativo de hoy, mismo cálculo que una diaria real
  // pero SIN generar nada — no marca órdenes, no crea liquidación. Sirve para que Admin (y jefe de
  // patio desde su propia vista) le muestre a un lavador cómo va, mientras el pago real es
  // semanal. Comparte el mismo estado `colilla`/modal que la colilla real, distinguido por `tipo`.
  const [cargandoColillaHoy, setCargandoColillaHoy] = useState<string | null>(null)
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

  // Jefe de patio (comisión por combo, ver Configuración) — mismo flujo que lavadores arriba, pero
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
  // Anular un corte mal generado (rango/lavador equivocado, doble generación). `tipo` distingue
  // qué RPC llamar; `label`/`monto` solo para el texto del modal.
  const [anulando, setAnulando] = useState<
    { tipo: 'lavador' | 'jefeZona'; id: string; label: string; monto: number } | null
  >(null)
  const [anulandoBusy, setAnulandoBusy] = useState(false)
  const [colillaJefeZona, setColillaJefeZona] = useState<ColillaJefeZonaData | null>(null)
  const [cargandoDetalleJefeZona, setCargandoDetalleJefeZona] = useState<string | null>(null)
  const [detalleJefeZona, setDetalleJefeZona] = useState<{ responsable: string; filas: DetalleOrdenJefeZonaFila[] } | null>(
    null,
  )

  // Lavadores y jefe de patio son el MISMO flujo (pendientes → generar diaria/semanal → colilla →
  // marcar pagada) con distinto sujeto; antes vivían como cuatro secciones apiladas en esta misma
  // página, que obligaba a bajar por dos históricos para llegar al segundo. Con el selector se ve
  // un flujo completo a la vez. Los montos pendientes de ambos siguen visibles juntos en el
  // dashboard, que es donde tiene sentido compararlos.
  const [sujeto, setSujeto] = useState<'lavadores' | 'jefe_zona'>('lavadores')
  // null = elegir sola: "Por pagar" si hay liquidaciones esperando pago, si no "Por liquidar".
  const [vista, setVista] = useState<VistaLiquidaciones | null>(null)
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
  const totalLiquidadoEnPeriodo = historicoEnPeriodo.filter((l) => !l.anulada).reduce((suma, l) => suma + l.monto, 0)
  const totalLiquidadoJefeZonaEnPeriodo = historicoJefeZonaEnPeriodo
    .filter((l) => !l.anulada)
    .reduce((suma, l) => suma + l.monto, 0)

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
        comision: {
          lavadorId: resumen.lavadorId,
          lavadorNombre: resumen.lavadorNombre,
          montoPendiente: resumen.montoPendiente,
          cantidadOrdenes: resumen.cantidadOrdenes,
          deudaPendiente: preview.deudaPendiente,
          montoNeto: preview.montoNeto,
        },
        periodicidad: 'semanal',
        periodoInicio: rangoPeriodo.periodoInicio,
        periodoFin: rangoPeriodo.periodoFin,
        preview,
        rangoLabel: rangoPeriodo.label,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el monto del periodo')
      toast.desdeError(err, 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculando(null)
    }
  }

  async function handleGenerarDesdeReporteJefeZona(resumen: ResumenPeriodoJefeZona) {
    setError(null)
    const key = `${resumen.personaId}:reporte`
    setCalculandoJefeZona(key)
    try {
      const preview = await fetchMontoPeriodoJefeZona(resumen.personaId, rangoPeriodo.periodoInicio, rangoPeriodo.periodoFin)
      setConfirmandoGenerarJefeZona({
        comision: {
          personaId: resumen.personaId,
          responsable: resumen.responsable,
          montoPendiente: resumen.montoPendiente,
          cantidadOrdenes: resumen.cantidadOrdenes,
          deudaPendiente: preview.deudaPendiente,
        },
        periodicidad: 'semanal',
        periodoInicio: rangoPeriodo.periodoInicio,
        periodoFin: rangoPeriodo.periodoFin,
        preview,
        rangoLabel: rangoPeriodo.label,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo calcular el monto del periodo')
      toast.desdeError(err, 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculandoJefeZona(null)
    }
  }

  const lavadoresPorId = useMemo(() => new Map(lavadores.map((l) => [l.id, l] as const)), [lavadores])

  const [filtroHistLavador, setFiltroHistLavador] = useState('')
  const [filtroHistEstadoLavador, setFiltroHistEstadoLavador] = useState('')
  const [filtroHistJZ, setFiltroHistJZ] = useState('')
  const [filtroHistEstadoJZ, setFiltroHistEstadoJZ] = useState('')

  const ESTADO_LIQUIDACION_OPTIONS = [
    { value: 'pendiente', label: 'En proceso de pago' },
    { value: 'pagada', label: 'Pagada' },
    { value: 'anulada', label: 'Anulada' },
  ]
  function coincideEstadoLiquidacion(l: { pagada: boolean; anulada: boolean }, filtro: string): boolean {
    if (!filtro) return true
    if (filtro === 'anulada') return l.anulada
    if (filtro === 'pagada') return l.pagada && !l.anulada
    return !l.pagada && !l.anulada
  }

  async function refresh() {
    const data = await loadData()
    setPendientes(data.pendientes)
    setHistorico(data.historico)
    setLavadores(data.lavadores)
    setConfiguracion(data.configuracion)
    setPendientesJefeZona(data.pendientesJefeZona)
    setHistoricoJefeZona(data.historicoJefeZona)
    setTurnoJefeZona(data.turnoJefeZona)
    setPrestamosTurno(data.prestamosTurno)
    router.invalidate()
  }

  // Reutilizable para "recién generada" (handleGenerar) y para reimprimir desde el histórico
  // (handleVerColilla) — el desglose siempre sale de `ordenes.liquidacion_id`, exacto a lo que
  // quedó liquidado de verdad, no del rango de fechas.
  async function abrirColilla(liquidacion: Liquidacion, lavadorNombre: string) {
    const [desglose, deudaRestante] = await Promise.all([
      fetchDesgloseLiquidacion(liquidacion.id, tiposVehiculo, combos),
      fetchDeudaTrasLiquidacion(liquidacion),
    ])
    setColilla({
      lavadorNombre,
      periodoInicio: liquidacion.periodoInicio,
      periodoFin: liquidacion.periodoFin,
      desglose,
      monto: liquidacion.monto,
      generadaEn: liquidacion.creadoEn,
      comisionBruta: liquidacion.comisionBruta,
      deudaDescontada: liquidacion.deudaDescontada,
      deudaRestante,
    })
  }

  async function handleVerColilla(liquidacion: Liquidacion) {
    setCargandoColilla(liquidacion.id)
    try {
      await abrirColilla(liquidacion, lavadoresPorId.get(liquidacion.lavadorId)?.nombre ?? '—')
    } catch (err) {
      toast.desdeError(err, 'No se pudo abrir la colilla')
    } finally {
      setCargandoColilla(null)
    }
  }

  // Colilla informativa del periodo que muestra el filtro de arriba (día, semana o mes): mismo
  // cálculo que se usaría para generar esa liquidación (fetchMontoPeriodo), pero no se genera nada
  // — no marca órdenes ni crea fila en `liquidaciones`. Es la "colilla del día" que Alessandro pidió
  // para mostrarle a un lavador cómo va, mientras el pago real es semanal. Cuenta cada vehículo
  // desde que se le asigna, esté cobrado o no. Solo cuenta lo que sigue SIN liquidar: si ese
  // periodo ya se liquidó, su colilla está en el histórico.
  async function handleVerColillaPeriodo(resumen: ResumenPeriodoLavador) {
    setCargandoColillaHoy(resumen.lavadorId)
    try {
      const { periodoInicio, periodoFin, label } = rangoPeriodo
      const preview = await fetchMontoPeriodo(resumen.lavadorId, periodoInicio, periodoFin, tiposVehiculo, combos)
      if (preview.cantidadOrdenes === 0) {
        toast.advertencia(
          `${resumen.lavadorNombre} no tiene órdenes sin liquidar en ${label} (si ya se liquidó, su colilla está en el histórico).`,
        )
        return
      }
      setColilla({
        lavadorNombre: resumen.lavadorNombre,
        periodoInicio,
        periodoFin,
        desglose: preview.desglose,
        monto: preview.monto,
        generadaEn: new Date().toISOString(),
        tipo: 'informativo',
        alcance: modoPeriodo,
        deudaPendiente: preview.deudaPendiente,
        montoNeto: preview.montoNeto,
      })
    } catch (err) {
      toast.desdeError(err, 'No se pudo calcular la colilla')
    } finally {
      setCargandoColillaHoy(null)
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
      toast.desdeError(err, 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculando(null)
    }
  }

  // El modal atrapa el error (y se queda abierto para corregir el descuento); si sale bien se cierra.
  async function handleGenerar(deudaADescontar: number) {
    if (!confirmandoGenerar) return
    const { comision, periodoInicio, periodoFin } = confirmandoGenerar
    setError(null)
    setGenerando(comision.lavadorId)
    try {
      const liquidacion = await generarLiquidacion(comision.lavadorId, periodoInicio, periodoFin, deudaADescontar)
      setConfirmandoGenerar(null)
      await refresh()
      await refreshResumen()
      await abrirColilla(liquidacion, comision.lavadorNombre)
    } finally {
      setGenerando(null)
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
    setCalculandoJefeZona(`${comision.personaId}:${periodicidad}`)
    try {
      const [periodoInicio, periodoFin] = rangoPorPeriodicidad(periodicidad)
      const preview = await fetchMontoPeriodoJefeZona(comision.personaId, periodoInicio, periodoFin)
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
      toast.desdeError(err, 'No se pudo calcular el monto del periodo')
    } finally {
      setCalculandoJefeZona(null)
    }
  }

  async function handleGenerarJefeZona(deudaADescontar: number) {
    if (!confirmandoGenerarJefeZona) return
    const { comision, periodoInicio, periodoFin } = confirmandoGenerarJefeZona
    setError(null)
    setGenerandoJefeZona(comision.personaId)
    try {
      const liquidacion = await generarLiquidacionJefeZona(
        comision.personaId,
        comision.responsable,
        periodoInicio,
        periodoFin,
        deudaADescontar,
      )
      setConfirmandoGenerarJefeZona(null)
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
    } finally {
      setGenerandoJefeZona(null)
    }
  }

  async function handleAnularLiquidacion(motivo: string, anuladaPor: string) {
    if (!anulando) return
    setAnulandoBusy(true)
    try {
      if (anulando.tipo === 'lavador') await anularLiquidacion(anulando.id, motivo, anuladaPor)
      else await anularLiquidacionJefeZona(anulando.id, motivo, anuladaPor)
      setAnulando(null)
      await refresh()
      await refreshResumen()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la liquidación')
      toast.desdeError(err, 'No se pudo anular la liquidación')
    } finally {
      setAnulandoBusy(false)
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

  async function handleVerDetalleJefeZona(personaId: string, responsable: string) {
    setError(null)
    setCargandoDetalleJefeZona(personaId)
    try {
      const ordenes = await fetchOrdenesPendientesJefeZona(personaId)
      const comboNombrePorId = new Map(combos.map((c) => [c.id, c.nombre] as const))
      const tipoNombrePorId = new Map(tiposVehiculo.map((t) => [t.id, t.nombre] as const))
      setDetalleJefeZona({
        responsable,
        filas: ordenes.map((o) => ({
          consecutivo: o.consecutivo,
          creadoEn: o.creadoEn,
          placa: o.placa,
          tipoNombre: tipoNombrePorId.get(o.tipoVehiculoId) ?? '—',
          comboNombre: o.comboId ? (comboNombrePorId.get(o.comboId) ?? 'Combo eliminado') : 'Sin combo',
          adicionales: o.adicionales,
          precio: o.precio,
          comisionJefeZona: o.comisionJefeZona,
        })),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el detalle de órdenes')
      toast.desdeError(err, 'No se pudo cargar el detalle de órdenes')
    } finally {
      setCargandoDetalleJefeZona(null)
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
    } catch (err) {
      toast.desdeError(err, 'No se pudo abrir la colilla')
    } finally {
      setCargandoColillaJefeZona(null)
    }
  }

  // --- Vista unificada: lavadores y jefe de patio se pintan con los mismos componentes ---
  const esLavadores = sujeto === 'lavadores'
  const filasHistorico: FilaLiquidacion[] = esLavadores
    ? historico.map((l) => ({ ...l, nombre: lavadoresPorId.get(l.lavadorId)?.nombre ?? '—' }))
    : historicoJefeZona.map((l) => ({ ...l, nombre: l.responsable }))
  const porPagar = filasHistorico.filter((l) => !l.pagada && !l.anulada)
  const totalPorPagar = porPagar.reduce((s, l) => s + l.monto, 0)
  const pagadas = filasHistorico.filter((l) => l.pagada && !l.anulada)
  const totalPendienteSujeto = esLavadores ? totalPendienteLavadores : totalPendienteJefeZona
  const pendientesSujeto = esLavadores ? pendientes.length : pendientesJefeZona.length

  const filtroTexto = esLavadores ? filtroHistLavador : filtroHistJZ
  const setFiltroTexto = esLavadores ? setFiltroHistLavador : setFiltroHistJZ
  const filtroEstado = esLavadores ? filtroHistEstadoLavador : filtroHistEstadoJZ
  const setFiltroEstado = esLavadores ? setFiltroHistEstadoLavador : setFiltroHistEstadoJZ
  const historicoFiltrado = filasHistorico.filter(
    (l) => coincide(l.nombre, filtroTexto) && coincideEstadoLiquidacion(l, filtroEstado),
  )

  function accionesFila(fila: FilaLiquidacion) {
    return {
      pagando: esLavadores ? pagando === fila.id : pagandoJefeZona === fila.id,
      cargandoColilla: esLavadores ? cargandoColilla === fila.id : cargandoColillaJefeZona === fila.id,
      onMarcarPagada: () => {
        if (esLavadores) setConfirmandoPago(historico.find((l) => l.id === fila.id) ?? null)
        else setConfirmandoPagoJefeZona(historicoJefeZona.find((l) => l.id === fila.id) ?? null)
      },
      onAnular: () =>
        setAnulando({ tipo: esLavadores ? 'lavador' : 'jefeZona', id: fila.id, label: fila.nombre, monto: fila.monto }),
      onVerColilla: () => {
        if (esLavadores) {
          const l = historico.find((x) => x.id === fila.id)
          if (l) void handleVerColilla(l)
        } else {
          const l = historicoJefeZona.find((x) => x.id === fila.id)
          if (l) void handleVerColillaJefeZona(l)
        }
      },
    }
  }

  const vistaActiva: VistaLiquidaciones = vista ?? (porPagar.length > 0 ? 'por_pagar' : 'por_liquidar')
  const VISTAS: { id: VistaLiquidaciones; label: string; count?: number }[] = [
    { id: 'por_liquidar', label: 'Por liquidar', count: pendientesSujeto },
    { id: 'por_pagar', label: 'Por pagar', count: porPagar.length },
    { id: 'periodo', label: 'Por periodo' },
    { id: 'historico', label: 'Histórico' },
  ]

  return (
    <div className="flex flex-col gap-6 text-left">
      <PageHeader
        title="Liquidaciones"
        description="Lo que se le debe al personal: generar el corte, pagarlo y consultar lo ya pagado."
        help={{
          body:
            `Se liquida sobre el acumulado, sin descuentos sobre el precio (regla de negocio 4). Puedes generar diaria o semanal para cualquier persona; la periodicidad resaltada (${periodicidadLabel}) y los porcentajes de comisión se definen en Configuración.\n\n` +
            'Cuenta el trabajo desde que se asigna el vehículo, sin importar si ya terminó el lavado o si el cliente pagó — solo se excluyen las órdenes anuladas.\n\n' +
            'El flujo es: Por liquidar (trabajo acumulado) → Generar → Por pagar (liquidación creada, falta entregar la plata) → Marcar pagada → Histórico.\n\n' +
            'Si la persona tiene deuda (préstamos, consumo de nevera), al generar eliges cuánto descontar.',
        }}
        actions={
          <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-neutral-200/60 p-1 sm:w-auto">
            {(
              [
                { value: 'lavadores' as const, label: 'Lavadores', icon: Wallet },
                { value: 'jefe_zona' as const, label: 'Jefe de patio', icon: ShieldCheck },
              ]
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => cambiarSujeto(value)}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  sujeto === value ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        }
      />

      {/* Resumen del flujo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ResumenPaso
          paso="1"
          label="Sin liquidar"
          valor={COP.format(totalPendienteSujeto)}
          hint={`${pendientesSujeto} persona${pendientesSujeto === 1 ? '' : 's'} con trabajo acumulado`}
          activo={vistaActiva === 'por_liquidar'}
          onClick={() => setVista('por_liquidar')}
        />
        <ResumenPaso
          paso="2"
          label="Generado, por pagar"
          valor={COP.format(totalPorPagar)}
          hint={`${porPagar.length} liquidación${porPagar.length === 1 ? '' : 'es'} esperando pago`}
          tono={porPagar.length > 0 ? 'warning' : 'neutro'}
          activo={vistaActiva === 'por_pagar'}
          onClick={() => setVista('por_pagar')}
        />
        <ResumenPaso
          paso="3"
          label="Pagado"
          valor={COP.format(pagadas.reduce((s, l) => s + l.monto, 0))}
          hint={`${pagadas.length} liquidación${pagadas.length === 1 ? '' : 'es'} en el histórico`}
          tono="success"
          activo={vistaActiva === 'historico'}
          onClick={() => setVista('historico')}
        />
      </div>

      <nav className="flex w-full flex-wrap gap-1 border-b border-neutral-200">
        {VISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVista(v.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              vistaActiva === v.id
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {v.label}
            {v.count !== undefined && v.count > 0 ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  vistaActiva === v.id ? 'bg-primary-100 text-primary-700' : 'bg-neutral-100 text-neutral-500'
                }`}
              >
                {v.count}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {error ? <p className="rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p> : null}

      {/* 1 · Por liquidar */}
      {vistaActiva === 'por_liquidar' ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title={esLavadores ? 'Comisiones acumuladas por lavador' : 'Comisión acumulada por jefe de patio'}
            hint={
              esLavadores
                ? 'Acumulado total sin liquidar. Al generar se calcula el monto real del rango elegido.'
                : `${(configuracion.comisionJefeZonaCombo1Porcentaje * 100).toFixed(1)}% (Combo 1) / ${(configuracion.comisionJefeZonaCombo2Porcentaje * 100).toFixed(1)}% (Combo 2 en adelante) de cada orden, para quien tenía el turno al registrarla.`
            }
          />
          {(esLavadores ? pendientes.length : pendientesJefeZona.length) === 0 ? (
            <Vacio texto={esLavadores ? 'Ningún lavador activo tiene comisiones por liquidar.' : 'Nadie tiene comisión de jefe de patio por liquidar.'} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {esLavadores
                ? pendientes.map((c) => (
                    <PendienteCard
                      key={c.lavadorId}
                      nombre={c.lavadorNombre}
                      icon={Wallet}
                      monto={c.montoPendiente}
                      ordenes={c.cantidadOrdenes}
                      deuda={c.deudaPendiente}
                      periodicidadDefault={configuracion.periodicidadLiquidacion}
                      calculando={(p) => calculando === `${c.lavadorId}:${p}`}
                      bloqueado={generando === c.lavadorId}
                      onGenerar={(p) => handleElegirPeriodicidad(c, p)}
                    />
                  ))
                : pendientesJefeZona.map((c) => (
                    <PendienteCard
                      key={c.personaId}
                      nombre={c.responsable}
                      icon={ShieldCheck}
                      monto={c.montoPendiente}
                      ordenes={c.cantidadOrdenes}
                      deuda={c.deudaPendiente}
                      periodicidadDefault={configuracion.periodicidadLiquidacion}
                      calculando={(p) => calculandoJefeZona === `${c.personaId}:${p}`}
                      bloqueado={generandoJefeZona === c.personaId}
                      onGenerar={(p) => handleElegirPeriodicidadJefeZona(c, p)}
                      onVerOrdenes={{
                        cargando: cargandoDetalleJefeZona === c.personaId,
                        onClick: () => handleVerDetalleJefeZona(c.personaId, c.responsable),
                      }}
                    />
                  ))}
            </div>
          )}

          {esLavadores ? (
            turnoJefeZona ? (
              <PrestamosDeTurno
                turno={turnoJefeZona}
                lavadores={lavadores}
                prestamos={prestamosTurno}
                onRegistrado={(prestamo) => setPrestamosTurno((previos) => [prestamo, ...previos])}
                size="sm"
              />
            ) : (
              <p className="flex items-center gap-2 rounded-xl bg-neutral-100/70 px-4 py-3 text-xs text-neutral-500">
                <HandCoins size={14} className="shrink-0" />
                Para prestarle a un lavador hace falta una caja de jefe de patio abierta.
              </p>
            )
          ) : null}
        </section>
      ) : null}

      {/* 2 · Por pagar */}
      {vistaActiva === 'por_pagar' ? (
        <section className="flex flex-col gap-4">
          <SectionHeader
            title="Liquidaciones generadas sin pagar"
            count={porPagar.length}
            hint="Ya se generó el corte; falta entregarle la plata a la persona y marcarla pagada."
          />
          {porPagar.length === 0 ? (
            <Vacio texto="No hay liquidaciones esperando pago." icon={CheckCircle2} />
          ) : (
            <ListaLiquidaciones filas={porPagar} acciones={accionesFila} destacarPago />
          )}
        </section>
      ) : null}

      {/* 3 · Por periodo */}
      {vistaActiva === 'periodo' ? (
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SectionHeader
              title="Reporte por periodo"
              hint="Lo generado en el rango (liquidado o no), con su colilla informativa."
            />
            <PeriodoSelector
              modo={modoPeriodo}
              onModoChange={cambiarModoPeriodo}
              ancla={anclaPeriodo}
              onAnclaChange={cambiarAnclaPeriodo}
              rango={rangoPeriodo}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniCifra
              label={`Generado · ${rangoPeriodo.label}`}
              valor={
                cargandoResumen
                  ? '…'
                  : COP.format(
                      esLavadores
                        ? resumenLavadores.reduce((s, r) => s + r.montoTotal, 0)
                        : resumenJefeZona.reduce((s, r) => s + r.montoTotal, 0),
                    )
              }
            />
            <MiniCifra
              label="Ya liquidado en el rango"
              valor={COP.format(esLavadores ? totalLiquidadoEnPeriodo : totalLiquidadoJefeZonaEnPeriodo)}
              hint={`${esLavadores ? historicoEnPeriodo.length : historicoJefeZonaEnPeriodo.length} liquidación(es)`}
            />
          </div>

          {(esLavadores ? resumenLavadores.length : resumenJefeZona.length) === 0 ? (
            <Vacio texto={cargandoResumen ? 'Cargando…' : `Nada generado en ${rangoPeriodo.label}.`} />
          ) : (
            <ul className="flex flex-col gap-2">
              {esLavadores
                ? resumenLavadores.map((r) => (
                    <FilaPeriodo
                      key={r.lavadorId}
                      nombre={r.lavadorNombre}
                      ordenes={r.cantidadOrdenes}
                      generado={r.montoTotal}
                      pendiente={r.montoPendiente}
                      acciones={
                        r.montoPendiente > 0 ? (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              icon={Receipt}
                              loading={cargandoColillaHoy === r.lavadorId}
                              onClick={() => handleVerColillaPeriodo(r)}
                              title="Corte informativo — no genera ni marca nada"
                            >
                              Colilla {COLILLA_DE[modoPeriodo]}
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              loading={calculando === `${r.lavadorId}:reporte`}
                              disabled={generando === r.lavadorId}
                              onClick={() => handleGenerarDesdeReporte(r)}
                            >
                              Generar
                            </Button>
                          </>
                        ) : null
                      }
                    />
                  ))
                : resumenJefeZona.map((r) => (
                    <FilaPeriodo
                      key={r.personaId}
                      nombre={r.responsable}
                      ordenes={r.cantidadOrdenes}
                      generado={r.montoTotal}
                      pendiente={r.montoPendiente}
                      acciones={
                        r.montoPendiente > 0 ? (
                          <Button
                            size="sm"
                            variant="primary"
                            loading={calculandoJefeZona === `${r.personaId}:reporte`}
                            disabled={generandoJefeZona === r.personaId}
                            onClick={() => handleGenerarDesdeReporteJefeZona(r)}
                          >
                            Generar
                          </Button>
                        ) : null
                      }
                    />
                  ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* 4 · Histórico */}
      {vistaActiva === 'historico' ? (
        <section className="flex flex-col gap-4">
          <BarraFiltros
            activos={[filtroTexto, filtroEstado].filter(Boolean).length}
            onLimpiar={() => {
              setFiltroTexto('')
              setFiltroEstado('')
            }}
            resultado={`${historicoFiltrado.length} de ${filasHistorico.length}`}
          >
            <FiltroCombo
              value={filtroTexto}
              onChange={setFiltroTexto}
              options={filasHistorico.map((l) => l.nombre)}
              placeholder={esLavadores ? 'Lavador' : 'Responsable'}
              icon={UserRound}
              ancho="sm:w-60"
            />
            <FiltroMenu label="Estado" value={filtroEstado} onChange={setFiltroEstado} options={ESTADO_LIQUIDACION_OPTIONS} todosLabel="Todas" />
          </BarraFiltros>
          {historicoFiltrado.length === 0 ? (
            <Vacio
              texto={
                filasHistorico.length === 0
                  ? 'Todavía no se ha generado ninguna liquidación.'
                  : 'Ninguna liquidación coincide con el filtro.'
              }
            />
          ) : (
            <ListaLiquidaciones filas={historicoFiltrado} acciones={accionesFila} />
          )}
        </section>
      ) : null}

      {confirmandoGenerar ? (
        <GenerarLiquidacionModal
          titulo={confirmandoGenerar.rangoLabel ? `Generar liquidación — ${confirmandoGenerar.rangoLabel}` : `Generar liquidación ${confirmandoGenerar.periodicidad}`}
          nombre={confirmandoGenerar.comision.lavadorNombre}
          comisionBruta={confirmandoGenerar.preview.monto}
          deudaPendiente={confirmandoGenerar.preview.deudaPendiente}
          resumen={`Liquidación ${
            confirmandoGenerar.rangoLabel
              ? `de ${confirmandoGenerar.rangoLabel}`
              : confirmandoGenerar.periodicidad === 'diaria'
                ? 'de hoy'
                : 'de los últimos 7 días'
          } (${confirmandoGenerar.periodoInicio} → ${confirmandoGenerar.periodoFin}) para ${
            confirmandoGenerar.comision.lavadorNombre
          }. Carros: ${confirmandoGenerar.preview.desglose.autos.cantidad} (${COP.format(
            confirmandoGenerar.preview.desglose.autos.monto,
          )}) · Motos: ${confirmandoGenerar.preview.desglose.motos.cantidad} (${COP.format(
            confirmandoGenerar.preview.desglose.motos.monto,
          )}).`}
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
          successMessage="Liquidación marcada como pagada"
          onConfirm={async () => {
            await handleMarcarPagada(confirmandoPago)
            setConfirmandoPago(null)
          }}
          onCancel={() => setConfirmandoPago(null)}
        />
      ) : null}

      {confirmandoGenerarJefeZona ? (
        <GenerarLiquidacionModal
          titulo={confirmandoGenerarJefeZona.rangoLabel ? `Generar liquidación — ${confirmandoGenerarJefeZona.rangoLabel}` : `Generar liquidación ${confirmandoGenerarJefeZona.periodicidad}`}
          nombre={confirmandoGenerarJefeZona.comision.responsable}
          comisionBruta={confirmandoGenerarJefeZona.preview.monto}
          deudaPendiente={confirmandoGenerarJefeZona.preview.deudaPendiente}
          resumen={`Liquidación ${
            confirmandoGenerarJefeZona.rangoLabel
              ? `de ${confirmandoGenerarJefeZona.rangoLabel}`
              : confirmandoGenerarJefeZona.periodicidad === 'diaria'
                ? 'de hoy'
                : 'de los últimos 7 días'
          } (${confirmandoGenerarJefeZona.periodoInicio} → ${confirmandoGenerarJefeZona.periodoFin}) para ${
            confirmandoGenerarJefeZona.comision.responsable
          } — ${confirmandoGenerarJefeZona.preview.cantidadOrdenes} orden${
            confirmandoGenerarJefeZona.preview.cantidadOrdenes === 1 ? '' : 'es'
          }.`}
          onConfirm={handleGenerarJefeZona}
          onCancel={() => setConfirmandoGenerarJefeZona(null)}
        />
      ) : null}

      {colillaJefeZona ? <ColillaJefeZonaModal colilla={colillaJefeZona} onClose={() => setColillaJefeZona(null)} /> : null}

      {detalleJefeZona ? (
        <DetalleOrdenesJefeZonaModal
          responsable={detalleJefeZona.responsable}
          filas={detalleJefeZona.filas}
          onClose={() => setDetalleJefeZona(null)}
        />
      ) : null}

      {confirmandoPagoJefeZona ? (
        <ConfirmModal
          title="Marcar liquidación como pagada"
          message={`¿Marcar como pagada la liquidación de ${confirmandoPagoJefeZona.responsable} por ${COP.format(confirmandoPagoJefeZona.monto)}?`}
          confirmLabel="Marcar pagada"
          variant="primary"
          successMessage="Liquidación marcada como pagada"
          onConfirm={async () => {
            await handleMarcarPagadaJefeZona(confirmandoPagoJefeZona)
            setConfirmandoPagoJefeZona(null)
          }}
          onCancel={() => setConfirmandoPagoJefeZona(null)}
        />
      ) : null}

      {anulando ? (
        <AnularLiquidacionModal
          label={anulando.label}
          monto={anulando.monto}
          busy={anulandoBusy}
          onCancel={() => setAnulando(null)}
          onConfirm={handleAnularLiquidacion}
        />
      ) : null}
    </div>
  )
}

type VistaLiquidaciones = 'por_liquidar' | 'por_pagar' | 'periodo' | 'historico'

// Forma común de una liquidación de lavador o de jefe de patio para pintarlas con un solo componente.
interface FilaLiquidacion {
  id: string
  nombre: string
  periodoInicio: string
  periodoFin: string
  creadoEn: string
  monto: number
  comisionBruta: number
  deudaDescontada: number
  pagada: boolean
  anulada: boolean
  anuladaPor?: string
  motivoAnulacion?: string
  pagadaEn?: string
}

interface AccionesFila {
  pagando: boolean
  cargandoColilla: boolean
  onMarcarPagada: () => void
  onAnular: () => void
  onVerColilla: () => void
}

type Icono = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

function Vacio({ texto, icon: Icon = Inbox }: { texto: string; icon?: Icono }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-10 text-center">
      <Icon size={22} className="text-neutral-300" />
      <p className="text-sm text-neutral-500">{texto}</p>
    </div>
  )
}

// Paso del flujo (Sin liquidar → Por pagar → Pagado): la tarjeta también es el atajo a su pestaña.
function ResumenPaso({
  paso,
  label,
  valor,
  hint,
  tono = 'neutro',
  activo,
  onClick,
}: {
  paso: string
  label: string
  valor: string
  hint: string
  tono?: 'neutro' | 'warning' | 'success'
  activo: boolean
  onClick: () => void
}) {
  const color = {
    neutro: 'bg-primary-50 text-primary-700',
    warning: 'bg-warning-50 text-warning-700',
    success: 'bg-success-50 text-success-700',
  }[tono]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-3 rounded-2xl border bg-white p-4 text-left shadow-card transition-all hover:shadow-card-hover ${
        activo ? 'border-primary-500 ring-1 ring-primary-500' : 'border-neutral-200'
      }`}
    >
      <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${color}`}>{paso}</span>
      <span className="min-w-0">
        <span className="block text-xs font-medium text-neutral-500">{label}</span>
        <span className="block text-xl font-semibold tabular-nums tracking-tight text-neutral-900">{valor}</span>
        <span className="block text-xs text-neutral-400">{hint}</span>
      </span>
    </button>
  )
}

function MiniCifra({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-card">
      <p className="truncate text-xs font-medium capitalize text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900">{valor}</p>
      {hint ? <p className="text-xs text-neutral-400">{hint}</p> : null}
    </div>
  )
}

function PendienteCard({
  nombre,
  icon: Icon,
  monto,
  ordenes,
  deuda,
  periodicidadDefault,
  calculando,
  bloqueado,
  onGenerar,
  onVerOrdenes,
}: {
  nombre: string
  icon: Icono
  monto: number
  ordenes: number
  deuda: number
  periodicidadDefault: Periodicidad
  calculando: (p: Periodicidad) => boolean
  bloqueado: boolean
  onGenerar: (p: Periodicidad) => void
  onVerOrdenes?: { cargando: boolean; onClick: () => void }
}) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{nombre}</p>
          {onVerOrdenes ? (
            <button
              type="button"
              disabled={onVerOrdenes.cargando}
              onClick={onVerOrdenes.onClick}
              className="text-xs font-medium text-primary-600 transition-colors hover:text-primary-800 disabled:opacity-50"
            >
              {onVerOrdenes.cargando ? 'Cargando…' : `${ordenes} orden${ordenes === 1 ? '' : 'es'} sin liquidar →`}
            </button>
          ) : (
            <p className="text-xs text-neutral-500">
              {ordenes} orden{ordenes === 1 ? '' : 'es'} sin liquidar
            </p>
          )}
        </div>
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-900">{COP.format(monto)}</p>
        {deuda > 0 ? (
          <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-warning-50 px-2.5 py-1.5 text-xs text-warning-700">
            <HandCoins size={13} className="shrink-0" />
            Debe {COP.format(deuda)} — eliges cuánto descontar al generar
          </p>
        ) : null}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-2">
        {(['diaria', 'semanal'] as const).map((p) => (
          <Button
            key={p}
            size="md"
            variant={p === periodicidadDefault ? 'primary' : 'secondary'}
            loading={calculando(p)}
            disabled={monto === 0 || bloqueado}
            onClick={() => onGenerar(p)}
            className="capitalize"
          >
            {p}
          </Button>
        ))}
      </div>
    </Card>
  )
}

function FilaPeriodo({
  nombre,
  ordenes,
  generado,
  pendiente,
  acciones,
}: {
  nombre: string
  ordenes: number
  generado: number
  pendiente: number
  acciones: ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-card sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">{nombre}</p>
        <p className="text-xs text-neutral-500">
          {ordenes} orden{ordenes === 1 ? '' : 'es'} · generado {COP.format(generado)}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        {pendiente > 0 ? (
          <span className="text-right">
            <span className="block text-[11px] text-neutral-400">Pendiente</span>
            <span className="block text-sm font-semibold tabular-nums text-warning-700">{COP.format(pendiente)}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-medium text-success-700">
            <CheckCircle2 size={13} /> Al día
          </span>
        )}
        {acciones ? <div className="flex flex-wrap justify-end gap-1.5">{acciones}</div> : null}
      </div>
    </li>
  )
}

function ListaLiquidaciones({
  filas,
  acciones,
  destacarPago = false,
}: {
  filas: FilaLiquidacion[]
  acciones: (fila: FilaLiquidacion) => AccionesFila
  destacarPago?: boolean
}) {
  return (
    <ul className="flex flex-col gap-2">
      {filas.map((fila) => (
        <ItemLiquidacion key={fila.id} fila={fila} {...acciones(fila)} destacarPago={destacarPago} />
      ))}
    </ul>
  )
}

// Una liquidación como tarjeta-fila: se lee igual en celular y en escritorio, sin tabla con scroll.
// periodoInicio === periodoFin es el mismo criterio con que se genera una diaria; la hora de
// generación distingue dos cortes del mismo día.
function ItemLiquidacion({
  fila,
  pagando,
  cargandoColilla,
  onMarcarPagada,
  onAnular,
  onVerColilla,
  destacarPago,
}: { fila: FilaLiquidacion; destacarPago: boolean } & AccionesFila) {
  const esDiaria = fila.periodoInicio === fila.periodoFin
  const periodo = esDiaria
    ? FECHA.format(new Date(`${fila.periodoInicio}T00:00:00`))
    : `${FECHA.format(new Date(`${fila.periodoInicio}T00:00:00`))} → ${FECHA.format(new Date(`${fila.periodoFin}T00:00:00`))}`
  const estado = fila.anulada
    ? { label: 'Anulada', clase: 'bg-danger-50 text-danger-700' }
    : fila.pagada
      ? { label: 'Pagada', clase: 'bg-success-50 text-success-700' }
      : { label: 'Por pagar', clase: 'bg-warning-50 text-warning-700' }
  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl border bg-white px-4 py-3 shadow-card sm:flex-row sm:items-center ${
        fila.anulada ? 'border-neutral-200 opacity-70' : 'border-neutral-200'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-neutral-900">{fila.nombre}</p>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${esDiaria ? 'bg-primary-50 text-primary-700' : 'bg-neutral-100 text-neutral-600'}`}>
            {esDiaria ? 'Diaria' : 'Semanal'}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${estado.clase}`} title={fila.motivoAnulacion}>
            {estado.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-neutral-500">
          {periodo} · generada {FECHA_HORA.format(new Date(fila.creadoEn))}
        </p>
        {fila.anulada && fila.motivoAnulacion ? (
          <p className="mt-0.5 text-xs text-danger-600">
            {fila.motivoAnulacion}
            {fila.anuladaPor ? ` · ${fila.anuladaPor}` : ''}
          </p>
        ) : null}
        {fila.pagada && fila.pagadaEn ? (
          <p className="mt-0.5 text-xs text-success-700">Pagada el {FECHA.format(new Date(fila.pagadaEn))}</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <span className="text-right">
          <span className={`block text-base font-semibold tabular-nums ${fila.anulada ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>
            {COP.format(fila.monto)}
          </span>
          {fila.deudaDescontada > 0 ? (
            <span className="block text-[11px] text-warning-700">
              −{COP.format(fila.deudaDescontada)} deuda · bruto {COP.format(fila.comisionBruta)}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={Receipt} loading={cargandoColilla} onClick={onVerColilla}>
            Colilla
          </Button>
          {!fila.anulada && !fila.pagada ? (
            <>
              <Button size="sm" variant="danger-ghost" onClick={onAnular}>
                Anular
              </Button>
              <Button
                size="sm"
                variant={destacarPago ? 'primary' : 'secondary'}
                icon={CheckCircle2}
                loading={pagando}
                onClick={onMarcarPagada}
              >
                Marcar pagada
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </li>
  )
}

// Anular un corte no pagado: motivo obligatorio + quién anula (regla 13, mismo patrón que anular
// una orden). La RPC devuelve las órdenes a "pendiente" y marca la liquidación anulada.
function AnularLiquidacionModal({
  label,
  monto,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string
  monto: number
  busy: boolean
  onCancel: () => void
  onConfirm: (motivo: string, anuladaPor: string) => void | Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [anuladaPor, setAnuladaPor] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (motivo.trim().length < 3) return setError('El motivo es obligatorio (mínimo 3 caracteres)')
    if (!anuladaPor.trim()) return setError('Indica quién anula la liquidación')
    setError(null)
    void onConfirm(motivo.trim(), anuladaPor.trim())
  }

  return (
    <Modal
      title="Anular liquidación"
      subtitle={`${label} · ${COP.format(monto)}. Las órdenes vuelven a quedar pendientes de liquidar.`}
      icon={Ban}
      tone="danger"
      size="sm"
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" form="form-anular-liquidacion" loading={busy}>
            Anular liquidación
          </Button>
        </>
      }
    >
      <form id="form-anular-liquidacion" onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Motivo</span>
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            placeholder="Ej. rango equivocado, se generó dos veces"
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Quién anula</span>
          <input
            value={anuladaPor}
            onChange={(e) => setAnuladaPor(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>
        {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      </form>
    </Modal>
  )
}
