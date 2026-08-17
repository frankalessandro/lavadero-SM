import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Wallet, CheckCircle2 } from 'lucide-react'
import {
  fetchComisionesPendientes,
  fetchLiquidaciones,
  generarLiquidacion,
  marcarLiquidacionPagada,
} from '../../../data/liquidaciones'
import { fetchLavadores } from '../../../data/lavadores'
import type { ComisionPendiente } from '../../../data/liquidaciones'
import type { Liquidacion } from '../../../schemas/liquidacion'
import type { Lavador } from '../../../schemas/lavador'
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
  const [pendientes, historico, lavadores] = await Promise.all([
    fetchComisionesPendientes(),
    fetchLiquidaciones(),
    fetchLavadores(),
  ])
  return { pendientes, historico, lavadores }
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
  const [generando, setGenerando] = useState<string | null>(null)
  const [pagando, setPagando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoGenerar, setConfirmandoGenerar] = useState<ComisionPendiente | null>(null)
  const [confirmandoPago, setConfirmandoPago] = useState<Liquidacion | null>(null)

  const lavadoresPorId = new Map(lavadores.map((l) => [l.id, l] as const))
  const lavadoresPagoDiario = lavadores.filter((l) => l.activo && l.pagoDiario)

  async function refresh() {
    const data = await loadData()
    setPendientes(data.pendientes)
    setHistorico(data.historico)
    setLavadores(data.lavadores)
    router.invalidate()
  }

  async function handleGenerar(comision: ComisionPendiente) {
    setError(null)
    setGenerando(comision.lavadorId)
    try {
      await generarLiquidacion(comision.lavadorId, hoyISO(-7), hoyISO())
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar la liquidación')
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

  return (
    <div className="flex flex-col gap-8 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Liquidaciones</h2>
        <p className="text-sm text-neutral-500">
          Liquidación semanal sobre el acumulado, sin descuentos al lavador (regla de negocio 4).
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
                <button
                  type="button"
                  disabled={comision.montoPendiente === 0 || generando === comision.lavadorId}
                  onClick={() => setConfirmandoGenerar(comision)}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {generando === comision.lavadorId ? 'Generando…' : 'Generar liquidación semanal'}
                </button>
              </Card>
            ))}
          </div>
          </>
        )}

        {lavadoresPagoDiario.length > 0 ? (
          <p className="rounded-lg bg-warning-50 px-4 py-3 text-xs text-warning-700">
            {lavadoresPagoDiario.map((l) => l.nombre).join(', ')}{' '}
            {lavadoresPagoDiario.length === 1 ? 'tiene' : 'tienen'} activada la excepción de pago
            diario (regla de negocio 4) — no {lavadoresPagoDiario.length === 1 ? 'entra' : 'entran'} en
            este flujo de liquidación semanal.
          </p>
        ) : null}
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
          title="Generar liquidación semanal"
          message={`¿Generar la liquidación de los últimos 7 días para ${confirmandoGenerar.lavadorNombre} por ${COP.format(confirmandoGenerar.montoPendiente)}?`}
          confirmLabel="Generar liquidación"
          variant="primary"
          onConfirm={async () => {
            await handleGenerar(confirmandoGenerar)
            setConfirmandoGenerar(null)
          }}
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
