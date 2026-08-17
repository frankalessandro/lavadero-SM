import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Droplets, ClipboardList, Users, Wallet, ArrowRight, X, CheckCircle2, Banknote } from 'lucide-react'
import { fetchOrdenesHoy, fetchOrdenesEntregadasHoy, marcarListo, cobrarYEntregarOrden } from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchCombos } from '../../data/combos'
import { cobroInputSchema, type EstadoOrden, type MetodoPago, type Orden } from '../../schemas/orden'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'

async function loadDashboard() {
  const [ordenesHoy, entregadasHoy, lavadores, combos] = await Promise.all([
    fetchOrdenesHoy(),
    fetchOrdenesEntregadasHoy(),
    fetchLavadores(),
    fetchCombos(),
  ])
  return { ordenesHoy, entregadasHoy, lavadores, combos }
}

export const Route = createFileRoute('/jefe-zona/')({
  loader: loadDashboard,
  component: JefeZonaDashboard,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

const ESTADO_LABEL: Record<EstadoOrden, string> = {
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
  anulada: 'Anulada',
}

const ESTADO_CLASS: Record<EstadoOrden, string> = {
  en_proceso: 'bg-warning-50 text-warning-700',
  listo: 'bg-primary-50 text-primary-700',
  entregado: 'bg-success-50 text-success-700',
  anulada: 'bg-danger-50 text-danger-700',
}

function JefeZonaDashboard() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [ordenesHoy, setOrdenesHoy] = useState(data.ordenesHoy)
  const [entregadasHoy, setEntregadasHoy] = useState(data.entregadasHoy)
  const [lavadores] = useState(data.lavadores)
  const [combos] = useState(data.combos)
  const [cobrando, setCobrando] = useState<Orden | null>(null)

  async function refresh() {
    const [nuevasOrdenes, nuevasEntregadas] = await Promise.all([fetchOrdenesHoy(), fetchOrdenesEntregadasHoy()])
    setOrdenesHoy(nuevasOrdenes)
    setEntregadasHoy(nuevasEntregadas)
    router.invalidate()
  }

  async function handleMarcarListo(orden: Orden) {
    await marcarListo(orden.id)
    await refresh()
  }

  const comboNombre = (id: string) => combos.find((c) => c.id === id)?.nombre ?? '—'
  const lavadorNombre = (id: string) => lavadores.find((l) => l.id === id)?.nombre ?? '—'

  const enPatio = ordenesHoy.filter((o) => o.estado === 'en_proceso' || o.estado === 'listo')
  const lavadoresActivos = lavadores.filter((l) => l.activo).length
  // Solo lo cobrado hoy — un vehículo registrado hoy pero no entregado no cuenta como plata en caja.
  const cajaDelDia = entregadasHoy.reduce((total, o) => total + o.precio, 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-primary-600 p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Recepción de lavado</h2>
          <p className="text-sm text-primary-100">Ingreso de vehículos — desde aquí se marca listo y se cobra.</p>
        </div>
        <Link
          to="/recepcion"
          className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-50"
        >
          Abrir recepción <ArrowRight size={15} />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lavados de hoy" value={String(ordenesHoy.length)} icon={Droplets} />
        <StatCard label="En proceso / listos" value={String(enPatio.length)} icon={ClipboardList} />
        <StatCard label="Lavadores activos" value={String(lavadoresActivos)} icon={Users} />
        <StatCard
          label="Caja del día"
          value={COP.format(cajaDelDia)}
          hint="Solo lo cobrado — sin arqueo (M5)"
          icon={Wallet}
        />
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-neutral-900">Vehículos en el patio ({enPatio.length})</h2>
        <div className="flex flex-col gap-2">
          {enPatio.map((orden) => (
            <Card key={orden.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-neutral-900">{orden.placa}</span>
                  <span className="text-xs text-neutral-400">#{orden.consecutivo}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {comboNombre(orden.comboId)} · {lavadorNombre(orden.lavadorId)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold text-neutral-900">{COP.format(orden.precio)}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[orden.estado]}`}>
                  {ESTADO_LABEL[orden.estado]}
                </span>
                {orden.estado === 'en_proceso' ? (
                  <button
                    type="button"
                    onClick={() => handleMarcarListo(orden)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
                  >
                    Marcar listo
                  </button>
                ) : null}
                {orden.estado === 'listo' ? (
                  <button
                    type="button"
                    onClick={() => setCobrando(orden)}
                    className="flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1 text-xs font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
                  >
                    <Banknote size={12} />
                    Cobrar y entregar
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
          {enPatio.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">No hay vehículos en proceso o listos ahora mismo.</Card>
          ) : null}
        </div>
      </div>

      {cobrando ? (
        <CobroModal
          orden={cobrando}
          onClose={() => setCobrando(null)}
          onCobrado={async () => {
            setCobrando(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function CobroModal({ orden, onClose, onCobrado }: { orden: Orden; onClose: () => void; onCobrado: () => Promise<void> }) {
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')
  const [referenciaPago, setReferenciaPago] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = cobroInputSchema.safeParse({
      metodoPago,
      referenciaPago: referenciaPago || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await cobrarYEntregarOrden(orden.id, parsed.data)
      await onCobrado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el cobro')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 shadow-card-hover sm:rounded-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-neutral-900">Cobrar y entregar</h3>
            <p className="text-xs text-neutral-500">
              {orden.placa} · #{orden.consecutivo}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
          <span className="font-medium text-primary-900">Total a cobrar</span>
          <span className="font-semibold text-primary-900">{COP.format(orden.precio)}</span>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Método de pago</span>
            <div className="grid grid-cols-2 gap-2">
              {(['efectivo', 'transferencia'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMetodoPago(value)}
                  className={`rounded-lg border px-3 py-2.5 text-sm font-medium capitalize transition-colors ${
                    metodoPago === value
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {metodoPago === 'transferencia' ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Referencia</span>
              <input
                autoFocus
                value={referenciaPago}
                onChange={(e) => setReferenciaPago(e.target.value)}
                placeholder="Comprobante"
                className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </label>
          ) : null}

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}

          <button
            type="submit"
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary-600 py-3 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
          >
            <CheckCircle2 size={16} />
            {saving ? 'Registrando…' : 'Confirmar cobro y entrega'}
          </button>
        </form>
      </div>
    </div>
  )
}
