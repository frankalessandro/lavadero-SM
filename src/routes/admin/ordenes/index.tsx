import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Ban, X } from 'lucide-react'
import { anularOrden, fetchOrdenesEnRango } from '../../../data/ordenes'
import { fetchLavadores } from '../../../data/lavadores'
import { fetchCombos } from '../../../data/combos'
import { anularOrdenInputSchema, type Orden } from '../../../schemas/orden'
import { Card } from '../../../components/layout/Card'

type RangoKey = 'hoy' | '7d' | '30d'

const RANGOS: { key: RangoKey; label: string; dias: number }[] = [
  { key: 'hoy', label: 'Hoy', dias: 1 },
  { key: '7d', label: 'Últimos 7 días', dias: 7 },
  { key: '30d', label: 'Últimos 30 días', dias: 30 },
]

function rangoFechas(dias: number): { desdeISO: string; hastaISO: string } {
  const ahora = new Date()
  const hoyMedianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const desde = new Date(hoyMedianoche)
  desde.setDate(desde.getDate() - (dias - 1))
  const hasta = new Date(hoyMedianoche)
  hasta.setDate(hasta.getDate() + 1)
  return { desdeISO: desde.toISOString(), hastaISO: hasta.toISOString() }
}

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const ESTADO_LABEL: Record<Orden['estado'], string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

const ESTADO_CLASSNAME: Record<Orden['estado'], string> = {
  en_proceso: 'bg-warning-50 text-warning-700',
  listo: 'bg-primary-50 text-primary-700',
  entregado: 'bg-success-50 text-success-700',
  anulada: 'bg-danger-50 text-danger-700',
}

async function loadOrdenesPage() {
  const { desdeISO, hastaISO } = rangoFechas(1)
  const [ordenes, lavadores, combos] = await Promise.all([
    fetchOrdenesEnRango(desdeISO, hastaISO),
    fetchLavadores(),
    fetchCombos(),
  ])
  return { ordenes, lavadores, combos }
}

export const Route = createFileRoute('/admin/ordenes/')({
  loader: loadOrdenesPage,
  component: OrdenesPage,
})

function OrdenesPage() {
  const initial = Route.useLoaderData()
  const [rango, setRango] = useState<RangoKey>('hoy')
  const [ordenes, setOrdenes] = useState(initial.ordenes)
  const [loading, setLoading] = useState(false)
  const lavadoresPorId = new Map(initial.lavadores.map((l) => [l.id, l.nombre]))
  const combosPorId = new Map(initial.combos.map((c) => [c.id, c.nombre]))
  const [anulando, setAnulando] = useState<Orden | null>(null)

  async function cambiarRango(key: RangoKey) {
    setRango(key)
    setLoading(true)
    try {
      const dias = RANGOS.find((r) => r.key === key)?.dias ?? 1
      const { desdeISO, hastaISO } = rangoFechas(dias)
      setOrdenes(await fetchOrdenesEnRango(desdeISO, hastaISO))
    } finally {
      setLoading(false)
    }
  }

  async function refrescar() {
    const dias = RANGOS.find((r) => r.key === rango)?.dias ?? 1
    const { desdeISO, hastaISO } = rangoFechas(dias)
    setOrdenes(await fetchOrdenesEnRango(desdeISO, hastaISO))
  }

  // Solo entregadas: en_proceso/listo todavía no se han cobrado, no cuentan como ingreso.
  const totalIngresos = ordenes.filter((o) => o.estado === 'entregado').reduce((total, o) => total + o.precio, 0)
  const anuladasEnRango = ordenes.filter((o) => o.estado === 'anulada')

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Órdenes</h2>
        <p className="text-sm text-neutral-500">Histórico de órdenes de lavado, con anulación auditada.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-neutral-300 p-1">
          {RANGOS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => cambiarRango(r.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                rango === r.key ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-neutral-500">
          Total ingresos del rango (solo entregadas/cobradas):{' '}
          <span className="font-semibold text-neutral-900">{COP.format(totalIngresos)}</span>
        </p>
      </div>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">Consec.</th>
                <th className="px-5 py-3">Placa</th>
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Combo</th>
                <th className="px-5 py-3">Lavador</th>
                <th className="px-5 py-3">Precio</th>
                <th className="px-5 py-3">Pago</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map((orden) => (
                <tr key={orden.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40">
                  <td className="px-5 py-3 text-neutral-500">#{orden.consecutivo}</td>
                  <td className="px-5 py-3 font-medium text-neutral-900">{orden.placa}</td>
                  <td className="px-5 py-3 text-neutral-700">{orden.clienteNombre}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {orden.comboId ? combosPorId.get(orden.comboId) ?? '—' : 'Sin combo'}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {orden.lavadorId ? lavadoresPorId.get(orden.lavadorId) ?? '—' : 'Sin asignar'}
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{COP.format(orden.precio)}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {orden.metodoPago === 'efectivo'
                      ? 'Efectivo'
                      : orden.metodoPago === 'transferencia'
                        ? 'Transferencia'
                        : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_CLASSNAME[orden.estado]}`}
                      title={
                        orden.estado === 'anulada'
                          ? `Motivo: ${orden.motivoAnulacion ?? '—'} · Anuló: ${orden.anuladaPor ?? '—'}`
                          : undefined
                      }
                    >
                      {ESTADO_LABEL[orden.estado]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end">
                      {orden.estado !== 'anulada' ? (
                        <button
                          type="button"
                          onClick={() => setAnulando(orden)}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-danger-600 transition-colors hover:bg-danger-50"
                        >
                          <Ban size={14} />
                          Anular
                        </button>
                      ) : (
                        <span className="text-xs text-neutral-400">
                          {orden.anuladaEn ? new Date(orden.anuladaEn).toLocaleDateString('es-CO') : ''}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {ordenes.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-neutral-400" colSpan={9}>
                    {loading ? 'Cargando…' : 'No hay órdenes en este rango.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {anuladasEnRango.length > 0 ? (
        <Card className="text-left">
          <h2 className="mb-3 text-sm font-semibold text-neutral-900">Anulaciones en el rango</h2>
          <ul className="flex flex-col gap-3 text-sm">
            {anuladasEnRango.map((o) => (
              <li key={o.id} className="border-b border-neutral-100 pb-2 last:border-0 last:pb-0">
                <p className="font-medium text-neutral-900">
                  #{o.consecutivo} · {o.placa}
                </p>
                <p className="text-neutral-500">
                  Motivo: {o.motivoAnulacion ?? '—'} · Anuló: {o.anuladaPor ?? '—'}
                  {o.anuladaEn ? ` · ${new Date(o.anuladaEn).toLocaleString('es-CO')}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {anulando ? (
        <AnularModal
          orden={anulando}
          onClose={() => setAnulando(null)}
          onAnulada={async () => {
            setAnulando(null)
            await refrescar()
          }}
        />
      ) : null}
    </div>
  )
}

function AnularModal({
  orden,
  onClose,
  onAnulada,
}: {
  orden: Orden
  onClose: () => void
  onAnulada: () => Promise<void>
}) {
  const [motivo, setMotivo] = useState('')
  const [anuladaPor, setAnuladaPor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = anularOrdenInputSchema.safeParse({ motivo, anuladaPor })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await anularOrden(orden.id, parsed.data)
      await onAnulada()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo anular la orden')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">
            Anular orden #{orden.consecutivo} · {orden.placa}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <p className="mb-5 text-xs text-neutral-500">
          Esta acción no se puede deshacer. La orden queda visible en reportes con el motivo y quién la anuló
          (control antifraude).
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Motivo de anulación</span>
            <textarea
              autoFocus
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="p. ej. Orden duplicada por error de digitación"
              rows={3}
              className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Quién anula</span>
            <input
              value={anuladaPor}
              onChange={(event) => setAnuladaPor(event.target.value)}
              placeholder="Nombre de quien anula"
              className="rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <div className="mt-1 flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-danger-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-danger-700 disabled:opacity-60"
            >
              {saving ? 'Anulando…' : 'Anular orden'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
