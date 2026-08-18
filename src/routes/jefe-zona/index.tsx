import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import {
  Droplets,
  ClipboardList,
  Users,
  Wallet,
  ArrowRight,
  X,
  CheckCircle2,
  Banknote,
  Sparkles,
  Car,
  Clock,
  SprayCan,
  Repeat,
  Timer,
  LockOpen,
  Lock,
} from 'lucide-react'
import {
  fetchOrdenesHoy,
  fetchOrdenesEntregadasHoy,
  marcarListo,
  cobrarYEntregarOrden,
  reasignarLavador,
} from '../../data/ordenes'
import { fetchLavadores } from '../../data/lavadores'
import { fetchCombos } from '../../data/combos'
import { fetchTurnoAbierto } from '../../data/turnos'
import { cobroInputSchema, type MetodoPago, type Orden } from '../../schemas/orden'
import { StatCard } from '../../components/layout/StatCard'
import { Card } from '../../components/layout/Card'
import { CustomSelect } from '../../components/layout/CustomSelect'
import { ReciboModal, type ReciboData } from '../../components/layout/ReciboModal'
import { ConfirmModal } from '../../components/layout/ConfirmModal'
import { BarChart } from '../../components/layout/BarChart'

async function loadDashboard() {
  const [ordenesHoy, entregadasHoy, lavadores, combos, turno] = await Promise.all([
    fetchOrdenesHoy(),
    fetchOrdenesEntregadasHoy(),
    fetchLavadores(),
    fetchCombos(),
    fetchTurnoAbierto('jefe_zona'),
  ])
  return { ordenesHoy, entregadasHoy, lavadores, combos, turno }
}

export const Route = createFileRoute('/jefe-zona/')({
  loader: loadDashboard,
  component: JefeZonaDashboard,
})

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

// Misma fórmula que `tiempoTranscurrido` en src/routes/vigilante/index.tsx — formato "12 min" / "1 h 5 min".
function tiempoTranscurrido(desde: string): string {
  const minutos = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000))
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${minutos % 60} min`
}

function formatMinutos(minutos: number): string {
  if (minutos < 60) return `${Math.round(minutos)} min`
  const horas = Math.floor(minutos / 60)
  return `${horas} h ${Math.round(minutos % 60)} min`
}

function JefeZonaDashboard() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [ordenesHoy, setOrdenesHoy] = useState(data.ordenesHoy)
  const [entregadasHoy, setEntregadasHoy] = useState(data.entregadasHoy)
  const [lavadores] = useState(data.lavadores)
  const [combos] = useState(data.combos)
  const [turno, setTurno] = useState(data.turno)
  const [cobrando, setCobrando] = useState<Orden | null>(null)
  const [reasignando, setReasignando] = useState<Orden | null>(null)
  const [finalizando, setFinalizando] = useState<Orden | null>(null)
  const [recibo, setRecibo] = useState<ReciboData | null>(null)

  // Tick compartido para el contador en vivo de cada tarjeta — un solo interval en vez de
  // uno por tarjeta, se limpia al desmontar el dashboard.
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  async function refresh() {
    const [nuevasOrdenes, nuevasEntregadas, nuevoTurno] = await Promise.all([
      fetchOrdenesHoy(),
      fetchOrdenesEntregadasHoy(),
      fetchTurnoAbierto('jefe_zona'),
    ])
    setOrdenesHoy(nuevasOrdenes)
    setEntregadasHoy(nuevasEntregadas)
    setTurno(nuevoTurno)
    router.invalidate()
  }

  async function handleMarcarListo(orden: Orden) {
    await marcarListo(orden.id)
    await refresh()
  }

  const comboNombre = (id: string) => combos.find((c) => c.id === id)?.nombre ?? '—'
  const lavadorNombre = (id: string) => lavadores.find((l) => l.id === id)?.nombre ?? '—'

  const enProcesoLista = ordenesHoy.filter((o) => o.estado === 'en_proceso')
  const listoLista = ordenesHoy.filter((o) => o.estado === 'listo')
  const lavadoresActivos = lavadores.filter((l) => l.activo).length
  // Solo lo cobrado hoy — un vehículo registrado hoy pero no entregado no cuenta como plata en caja.
  const cajaDelDia = entregadasHoy.reduce((total, o) => total + o.precio, 0)

  // Tiempo promedio de atención de hoy (M3), por combo y por lavador — solo entregadas, que
  // son las que tienen `entregadaEn` real.
  const promedios = useMemo(() => {
    const porCombo = new Map<string, { total: number; cantidad: number }>()
    const porLavador = new Map<string, { total: number; cantidad: number }>()
    for (const orden of entregadasHoy) {
      if (!orden.entregadaEn) continue
      const minutos = (new Date(orden.entregadaEn).getTime() - new Date(orden.creadoEn).getTime()) / 60000
      const combo = porCombo.get(orden.comboId) ?? { total: 0, cantidad: 0 }
      combo.total += minutos
      combo.cantidad += 1
      porCombo.set(orden.comboId, combo)
      const lavador = porLavador.get(orden.lavadorId) ?? { total: 0, cantidad: 0 }
      lavador.total += minutos
      lavador.cantidad += 1
      porLavador.set(orden.lavadorId, lavador)
    }
    return {
      porCombo: Array.from(porCombo.entries()).map(([id, v]) => ({
        nombre: comboNombre(id),
        promedio: v.total / v.cantidad,
      })),
      porLavador: Array.from(porLavador.entries()).map(([id, v]) => ({
        nombre: lavadorNombre(id),
        promedio: v.total / v.cantidad,
      })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregadasHoy])

  async function handleCobrado(orden: Orden, metodoPago: MetodoPago, referenciaPago?: string) {
    setRecibo({
      consecutivo: orden.consecutivo,
      placa: orden.placa,
      clienteNombre: orden.clienteNombre,
      comboNombre: comboNombre(orden.comboId),
      tipoNombre: '—',
      lavadorNombre: lavadorNombre(orden.lavadorId),
      precio: orden.precio,
      fecha: new Date().toISOString(),
      metodoPago,
      referenciaPago,
    })
    setCobrando(null)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3 rounded-2xl bg-primary-600 p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Recepción de lavado</h2>
          <p className="text-sm text-primary-100">Ingreso de vehículos — el seguimiento y el cobro se hacen aquí mismo.</p>
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
        <StatCard label="En proceso / listos" value={String(enProcesoLista.length + listoLista.length)} icon={ClipboardList} />
        <StatCard label="Lavadores activos" value={String(lavadoresActivos)} icon={Users} />
        <StatCard label="Caja del día" value={COP.format(cajaDelDia)} hint="Solo lo cobrado — sin arqueo (M5)" icon={Wallet} />
      </div>

      {/* Uso de escritorio: caja a la vista, sin salir del dashboard */}
      <Card className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              turno ? 'bg-success-50 text-success-700' : 'bg-warning-50 text-warning-700'
            }`}
          >
            {turno ? <LockOpen size={18} strokeWidth={2} /> : <Lock size={18} strokeWidth={2} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              {turno ? `Turno abierto — ${turno.responsable}` : 'No hay turno abierto'}
            </p>
            <p className="text-xs text-neutral-500">
              {turno ? `Desde las ${new Date(turno.abiertoEn).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} · base ${COP.format(turno.baseInicial)}` : 'Ábrelo para que el arqueo cuadre al cierre.'}
            </p>
          </div>
        </div>
        <Link
          to="/jefe-zona/caja"
          className="whitespace-nowrap rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
        >
          {turno ? 'Ir a caja' : 'Abrir turno'}
        </Link>
      </Card>

      {/* Tiempo promedio — solo tiene sentido como chart cuando hay varios combos/lavadores que
          comparar; con 1–2 nada más un número es más claro que una barra. Full-width para que
          las barras horizontales tengan espacio real, no un cuarto de página. */}
      {entregadasHoy.length > 0 ? (
        <Card>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
            <Timer size={15} className="text-primary-500" />
            Tiempo promedio de atención (hoy)
          </h3>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-500">Por combo</p>
              {promedios.porCombo.length > 2 ? (
                <BarChart
                  labels={promedios.porCombo.map((p) => p.nombre)}
                  data={promedios.porCombo.map((p) => p.promedio)}
                  valueFormatter={formatMinutos}
                  height={Math.max(100, promedios.porCombo.length * 36)}
                />
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {promedios.porCombo.map((p) => (
                    <li key={p.nombre} className="flex items-center justify-between gap-2">
                      <span className="truncate text-neutral-600">{p.nombre}</span>
                      <span className="shrink-0 font-medium text-neutral-900">{formatMinutos(p.promedio)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-500">Por lavador</p>
              {promedios.porLavador.length > 2 ? (
                <BarChart
                  labels={promedios.porLavador.map((p) => p.nombre)}
                  data={promedios.porLavador.map((p) => p.promedio)}
                  valueFormatter={formatMinutos}
                  height={Math.max(100, promedios.porLavador.length * 36)}
                />
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {promedios.porLavador.map((p) => (
                    <li key={p.nombre} className="flex items-center justify-between gap-2">
                      <span className="truncate text-neutral-600">{p.nombre}</span>
                      <span className="shrink-0 font-medium text-neutral-900">{formatMinutos(p.promedio)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      {/* Tablero de seguimiento (M3) — 2 columnas en escritorio, apiladas en celular */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <SprayCan size={15} className="text-warning-600" />
            En proceso ({enProcesoLista.length})
          </h2>
          <div className="flex flex-col gap-3">
            {enProcesoLista.map((orden) => (
              <OrdenCard
                key={orden.id}
                orden={orden}
                comboNombre={comboNombre(orden.comboId)}
                lavadorNombre={lavadorNombre(orden.lavadorId)}
                desde={orden.creadoEn}
                onFinalizar={() => setFinalizando(orden)}
                onReasignar={() => setReasignando(orden)}
              />
            ))}
            {enProcesoLista.length === 0 ? (
              <Card className="py-8 text-center text-sm text-neutral-400">Nada en proceso ahora mismo.</Card>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <CheckCircle2 size={15} className="text-primary-600" />
            Listos para cobrar ({listoLista.length})
          </h2>
          <div className="flex flex-col gap-3">
            {listoLista.map((orden) => (
              <OrdenCard
                key={orden.id}
                orden={orden}
                comboNombre={comboNombre(orden.comboId)}
                lavadorNombre={lavadorNombre(orden.lavadorId)}
                desde={orden.listaEn ?? orden.creadoEn}
                onCobrar={() => setCobrando(orden)}
              />
            ))}
            {listoLista.length === 0 ? (
              <Card className="py-8 text-center text-sm text-neutral-400">Nada listo para cobrar todavía.</Card>
            ) : null}
          </div>
        </div>
      </div>

      {cobrando ? (
        <CobroModal
          orden={cobrando}
          onClose={() => setCobrando(null)}
          onCobrado={(metodoPago, referenciaPago) => handleCobrado(cobrando, metodoPago, referenciaPago)}
        />
      ) : null}

      {reasignando ? (
        <ReasignarModal
          orden={reasignando}
          lavadores={lavadores.filter((l) => l.activo)}
          onClose={() => setReasignando(null)}
          onReasignado={async () => {
            setReasignando(null)
            await refresh()
          }}
        />
      ) : null}

      {recibo ? <ReciboModal recibo={recibo} variant="pago" onClose={() => setRecibo(null)} /> : null}

      {finalizando ? (
        <ConfirmModal
          title={`¿Finalizar el lavado de ${finalizando.placa}?`}
          message="Pasará a la columna de Listos para cobrar."
          confirmLabel="Finalizar lavado"
          variant="primary"
          onConfirm={async () => {
            await handleMarcarListo(finalizando)
            setFinalizando(null)
          }}
          onCancel={() => setFinalizando(null)}
        />
      ) : null}
    </div>
  )
}

function OrdenCard({
  orden,
  comboNombre,
  lavadorNombre,
  desde,
  onFinalizar,
  onCobrar,
  onReasignar,
}: {
  orden: Orden
  comboNombre: string
  lavadorNombre: string
  desde: string
  onFinalizar?: () => void
  onCobrar?: () => void
  onReasignar?: () => void
}) {
  const enProceso = orden.estado === 'en_proceso'
  return (
    <Card
      className={`flex items-center justify-between gap-4 border-l-4 p-4 transition-all duration-300 ${
        enProceso ? 'border-l-warning-600 bg-warning-50/40' : 'border-l-primary-500 bg-primary-50/40 shadow-nav-active'
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-lg font-bold tracking-tight text-neutral-900">{orden.placa}</span>
          <span className="text-xs text-neutral-400">#{orden.consecutivo}</span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Sparkles size={13} className="text-primary-500" /> {comboNombre}
          </span>
          <span className="flex items-center gap-1">
            <Car size={13} className="text-primary-500" /> {lavadorNombre}
          </span>
          <span className="flex items-center gap-1 font-medium text-neutral-600">
            <Clock size={13} /> {tiempoTranscurrido(desde)}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="text-base font-semibold text-neutral-900">{COP.format(orden.precio)}</span>
        <div className="flex items-center gap-1.5">
          {onReasignar ? (
            <button
              type="button"
              onClick={onReasignar}
              title="Reasignar lavador"
              aria-label="Reasignar lavador"
              className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
            >
              <Repeat size={14} />
            </button>
          ) : null}
          {onFinalizar ? (
            <button
              type="button"
              onClick={onFinalizar}
              className="flex items-center gap-1.5 rounded-lg bg-warning-600 px-3 py-2 text-xs font-semibold text-white shadow-card transition-colors hover:bg-warning-700"
            >
              <SprayCan size={14} />
              Finalizar lavado
            </button>
          ) : null}
          {onCobrar ? (
            <button
              type="button"
              onClick={onCobrar}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700"
            >
              <Banknote size={14} />
              Cobrar y entregar
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

function ReasignarModal({
  orden,
  lavadores,
  onClose,
  onReasignado,
}: {
  orden: Orden
  lavadores: { id: string; nombre: string }[]
  onClose: () => void
  onReasignado: () => Promise<void>
}) {
  const [lavadorId, setLavadorId] = useState(orden.lavadorId)
  const [saving, setSaving] = useState(false)

  async function handleConfirmar() {
    if (lavadorId === orden.lavadorId) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await reasignarLavador(orden.id, lavadorId)
      await onReasignado()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-neutral-900">Reasignar lavador</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          {orden.placa} · #{orden.consecutivo}
        </p>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Lavador</span>
          <CustomSelect
            size="sm"
            value={lavadorId}
            onChange={setLavadorId}
            placeholder="Selecciona…"
            options={lavadores.map((l) => ({ value: l.id, label: l.nombre }))}
          />
        </label>
        <button
          type="button"
          onClick={handleConfirmar}
          disabled={saving}
          className="mt-5 w-full rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Confirmar reasignación'}
        </button>
      </div>
    </div>
  )
}

function CobroModal({
  orden,
  onClose,
  onCobrado,
}: {
  orden: Orden
  onClose: () => void
  onCobrado: (metodoPago: MetodoPago, referenciaPago?: string) => void
}) {
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
      onCobrado(parsed.data.metodoPago, parsed.data.referenciaPago)
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
