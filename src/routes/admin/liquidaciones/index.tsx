import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Wallet, CheckCircle2 } from 'lucide-react'
import {
  fetchComisionesPendientes,
  fetchLiquidaciones,
  fetchMontoPeriodo,
  generarLiquidacion,
  marcarLiquidacionPagada,
  type MontoPeriodo,
} from '../../../data/liquidaciones'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchConfiguracion } from '../../../data/configuracion'
import type { ComisionPendiente } from '../../../data/liquidaciones'
import type { Liquidacion } from '../../../schemas/liquidacion'
import type { Lavador } from '../../../schemas/lavador'
import type { Configuracion } from '../../../schemas/configuracion'
import { Card } from '../../../components/layout/Card'
import { ConfirmModal } from '../../../components/layout/ConfirmModal'
import { BarChart } from '../../../components/layout/BarChart'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function hoyISO(offsetDias = 0): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + offsetDias)
  return fecha.toISOString().slice(0, 10)
}

async function loadData() {
  const [pendientes, historico, lavadores, configuracion] = await Promise.all([
    fetchComisionesPendientes(),
    fetchLiquidaciones(),
    fetchLavadores(),
    fetchConfiguracion(),
  ])
  return { pendientes, historico, lavadores, configuracion }
}

// Admin puede generar liquidación diaria (solo hoy) o semanal (últimos 7 días) para cualquier
// lavador, sin importar la periodicidad "normal" configurada — esa configuración (Configuración
// > periodicidad de liquidación) solo decide cuál de las dos se resalta como default en esta
// pantalla, ambas siguen disponibles siempre.
type Periodicidad = Configuracion['periodicidadLiquidacion']

function rangoPorPeriodicidad(periodicidad: Periodicidad): [string, string] {
  return periodicidad === 'diaria' ? [hoyISO(), hoyISO()] : [hoyISO(-7), hoyISO()]
}

export const Route = createFileRoute('/admin/liquidaciones/')({
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
  const periodicidadLabel = configuracion.periodicidadLiquidacion === 'diaria' ? 'diaria' : 'semanal'
  const [generando, setGenerando] = useState<string | null>(null)
  // Clave `${lavadorId}:${periodicidad}` mientras se calcula el monto real del rango antes de
  // mostrar el confirm (ver fetchMontoPeriodo) — es lo que deshabilita el botón que se tocó.
  const [calculando, setCalculando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoGenerar, setConfirmandoGenerar] = useState<{
    comision: ComisionPendiente
    periodicidad: Periodicidad
    periodoInicio: string
    periodoFin: string
    preview: MontoPeriodo
  } | null>(null)
  const [confirmandoPago, setConfirmandoPago] = useState<Liquidacion | null>(null)

  const lavadoresPorId = new Map(lavadores.map((l) => [l.id, l] as const))

  async function refresh() {
    const data = await loadData()
    setPendientes(data.pendientes)
    setHistorico(data.historico)
    setLavadores(data.lavadores)
    setConfiguracion(data.configuracion)
    router.invalidate()
  }

  // El monto de la tarjeta (`comision.montoPendiente`) es el acumulado TOTAL sin liquidar, no lo
  // que cae dentro de "hoy" o "últimos 7 días" — por eso se calcula el monto real del rango
  // elegido antes de confirmar, en vez de mostrar esa cifra como si fuera lo que se va a generar.
  async function handleElegirPeriodicidad(comision: ComisionPendiente, periodicidad: Periodicidad) {
    setError(null)
    setCalculando(`${comision.lavadorId}:${periodicidad}`)
    try {
      const [periodoInicio, periodoFin] = rangoPorPeriodicidad(periodicidad)
      const preview = await fetchMontoPeriodo(comision.lavadorId, periodoInicio, periodoFin)
      if (preview.cantidadOrdenes === 0) {
        setError(
          `${comision.lavadorNombre} no tiene órdenes entregadas sin liquidar en ${
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
      await generarLiquidacion(comision.lavadorId, periodoInicio, periodoFin)
      await refresh()
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

  return (
    <div className="flex flex-col gap-8 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Liquidaciones</h2>
        <p className="text-sm text-neutral-500">
          Sobre el acumulado, sin descuentos al lavador (regla de negocio 4) — genera diaria o semanal para
          cualquier lavador; la periodicidad marcada como default ({periodicidadLabel}) se define en{' '}
          <span className="font-medium text-neutral-700">Configuración</span>.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg bg-danger-50 px-4 py-3 text-sm text-danger-700">{error}</p>
      ) : null}

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
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">Lavador</th>
                <th className="px-5 py-3">Periodo</th>
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
                  onMarcarPagada={() => setConfirmandoPago(liquidacion)}
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

      {confirmandoGenerar ? (
        <ConfirmModal
          title={`Generar liquidación ${confirmandoGenerar.periodicidad}`}
          message={`¿Generar la liquidación ${
            confirmandoGenerar.periodicidad === 'diaria' ? 'de hoy' : 'de los últimos 7 días'
          } (${confirmandoGenerar.periodoInicio} → ${confirmandoGenerar.periodoFin}) para ${
            confirmandoGenerar.comision.lavadorNombre
          } por ${COP.format(confirmandoGenerar.preview.monto)} (${confirmandoGenerar.preview.cantidadOrdenes} orden${
            confirmandoGenerar.preview.cantidadOrdenes === 1 ? '' : 'es'
          })?`}
          confirmLabel="Generar liquidación"
          variant="primary"
          onConfirm={handleGenerar}
          onCancel={() => setConfirmandoGenerar(null)}
        />
      ) : null}

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
    </div>
  )
}

function LiquidacionRow({
  liquidacion,
  lavador,
  pagando,
  onMarcarPagada,
}: {
  liquidacion: Liquidacion
  lavador: Lavador | undefined
  pagando: boolean
  onMarcarPagada: () => void
}) {
  return (
    <tr className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
      <td className="px-5 py-3 font-medium text-neutral-900">{lavador?.nombre ?? '—'}</td>
      <td className="px-5 py-3 text-neutral-600">
        {liquidacion.periodoInicio} → {liquidacion.periodoFin}
      </td>
      <td className="px-5 py-3 text-neutral-900">{COP.format(liquidacion.monto)}</td>
      <td className="px-5 py-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
            liquidacion.pagada ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
          }`}
        >
          {liquidacion.pagada ? 'Pagada' : 'Pendiente'}
        </span>
      </td>
      <td className="px-5 py-3">
        <div className="flex justify-end">
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
