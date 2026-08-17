import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Sparkles, Car } from 'lucide-react'
import { fetchTiposVehiculo } from '../../data/tiposVehiculo'
import { fetchCombos } from '../../data/combos'
import { fetchPrecios, findPrecio } from '../../data/precios'
import { fetchLavadores, suggestNextLavador } from '../../data/lavadores'
import { fetchOrdenesHoy, buscarPorPlaca, createOrden } from '../../data/ordenes'
import { ordenInputSchema, type EstadoOrden, type Orden } from '../../schemas/orden'
import type { TipoVehiculo } from '../../schemas/tipoVehiculo'
import type { Combo } from '../../schemas/combo'
import type { Lavador } from '../../schemas/lavador'
import type { Precio } from '../../schemas/precio'
import { Card } from '../../components/layout/Card'
import { AccordionSection } from '../../components/layout/Accordion'
import { CustomSelect } from '../../components/layout/CustomSelect'

async function loadRecepcion() {
  const [tipos, combos, precios, lavadores, ordenesHoy] = await Promise.all([
    fetchTiposVehiculo(),
    fetchCombos(),
    fetchPrecios(),
    fetchLavadores(),
    fetchOrdenesHoy(),
  ])
  return { tipos, combos, precios, lavadores, ordenesHoy }
}

export const Route = createFileRoute('/recepcion/')({
  loader: loadRecepcion,
  component: RecepcionPage,
})

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

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function RecepcionPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [tipos] = useState<TipoVehiculo[]>(data.tipos)
  const [combos] = useState<Combo[]>(data.combos)
  const [precios] = useState<Precio[]>(data.precios)
  const [lavadores] = useState<Lavador[]>(data.lavadores)
  const [ordenesHoy, setOrdenesHoy] = useState<Orden[]>(data.ordenesHoy)

  async function refresh() {
    setOrdenesHoy(await fetchOrdenesHoy())
    router.invalidate()
  }

  const tipoNombre = (id: string) => tipos.find((t) => t.id === id)?.nombre ?? '—'
  const comboNombre = (id: string) => combos.find((c) => c.id === id)?.nombre ?? '—'
  const lavadorNombre = (id: string) => lavadores.find((l) => l.id === id)?.nombre ?? '—'

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 pb-6">
      <ReceptionForm tipos={tipos} combos={combos} precios={precios} lavadores={lavadores} onCreated={refresh} />

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-neutral-900">
          Vehículos de hoy ({ordenesHoy.length})
        </h2>
        <div className="flex flex-col gap-2">
          {ordenesHoy.map((orden) => (
            <Card key={orden.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-neutral-900">{orden.placa}</span>
                  <span className="text-xs text-neutral-400">#{orden.consecutivo}</span>
                </div>
                <p className="mt-0.5 truncate text-xs text-neutral-500">
                  {tipoNombre(orden.tipoVehiculoId)} · {comboNombre(orden.comboId)} · {lavadorNombre(orden.lavadorId)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className="text-sm font-semibold text-neutral-900">{COP.format(orden.precio)}</span>
                <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_CLASS[orden.estado]}`}>
                  {ESTADO_LABEL[orden.estado]}
                </span>
              </div>
            </Card>
          ))}
          {ordenesHoy.length === 0 ? (
            <Card className="py-10 text-center text-sm text-neutral-400">Todavía no se han registrado vehículos hoy.</Card>
          ) : null}
        </div>
        <p className="mt-2 px-1 text-xs text-neutral-400">
          Marcar listo y cobrar/entregar se hace desde el panel de jefe de zona.
        </p>
      </div>
    </div>
  )
}

const emptyForm = {
  placa: '',
  clienteNombre: '',
  clienteTelefono: '',
  tipoVehiculoId: '',
  comboId: '',
  lavadorId: '',
  observaciones: '',
}

function ReceptionForm({
  tipos,
  combos,
  precios,
  lavadores,
  onCreated,
}: {
  tipos: TipoVehiculo[]
  combos: Combo[]
  precios: Precio[]
  lavadores: Lavador[]
  onCreated: () => void
}) {
  const [form, setForm] = useState(emptyForm)
  const [openStep, setOpenStep] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastTicket, setLastTicket] = useState<number | null>(null)

  useEffect(() => {
    suggestNextLavador().then((id) => {
      if (id) setForm((prev) => (prev.lavadorId ? prev : { ...prev, lavadorId: id }))
    })
  }, [])

  const combosDisponibles = useMemo(
    () => combos.filter((combo) => combo.activo && !!findPrecio(precios, combo.id, form.tipoVehiculoId)),
    [combos, precios, form.tipoVehiculoId],
  )

  const precio =
    form.tipoVehiculoId && form.comboId ? findPrecio(precios, form.comboId, form.tipoVehiculoId)?.precio : undefined
  const comisionLavador = precio ? Math.round(precio * 0.4) : undefined
  const comisionNegocio = precio && comisionLavador !== undefined ? precio - comisionLavador : undefined

  const paso1Completo = !!(form.placa && form.clienteNombre && form.tipoVehiculoId)
  const paso2Completo = !!(form.comboId && form.lavadorId)

  function update<K extends keyof typeof emptyForm>(key: K, value: (typeof emptyForm)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleStep(step: number) {
    setOpenStep((prev) => (prev === step ? 0 : step))
  }

  async function handlePlacaBlur() {
    const historial = await buscarPorPlaca(form.placa)
    if (!historial) return
    setForm((prev) => ({
      ...prev,
      clienteNombre: prev.clienteNombre || historial.clienteNombre,
      clienteTelefono: prev.clienteTelefono || historial.clienteTelefono || '',
      tipoVehiculoId: prev.tipoVehiculoId || historial.tipoVehiculoId,
      comboId: prev.comboId || historial.comboId,
    }))
  }

  function handleTipoChange(tipoVehiculoId: string) {
    setForm((prev) => ({ ...prev, tipoVehiculoId, comboId: '' }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = ordenInputSchema.safeParse({
      ...form,
      clienteTelefono: form.clienteTelefono || undefined,
      observaciones: form.observaciones || undefined,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los datos del formulario')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const orden = await createOrden(parsed.data)
      setLastTicket(orden.consecutivo)
      const siguienteLavador = await suggestNextLavador()
      setForm({ ...emptyForm, lavadorId: siguienteLavador ?? '' })
      setOpenStep(1)
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la orden')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <AccordionSection
        step={1}
        title="Vehículo"
        summary={form.placa ? `${form.placa}${form.clienteNombre ? ` · ${form.clienteNombre}` : ''}` : 'Placa y cliente'}
        isOpen={openStep === 1}
        isComplete={paso1Completo}
        onToggle={() => toggleStep(1)}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Placa</span>
          <input
            autoFocus
            value={form.placa}
            onChange={(e) => update('placa', e.target.value.toUpperCase())}
            onBlur={handlePlacaBlur}
            placeholder="AB123CD"
            className="rounded-lg border border-neutral-300 px-3 py-3 font-mono text-base uppercase outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Tipo de vehículo</span>
          <CustomSelect
            value={form.tipoVehiculoId}
            onChange={handleTipoChange}
            placeholder="Selecciona…"
            options={tipos.filter((t) => t.activo).map((t) => ({ value: t.id, label: t.nombre }))}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Cliente</span>
            <input
              value={form.clienteNombre}
              onChange={(e) => update('clienteNombre', e.target.value)}
              placeholder="Nombre"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Teléfono</span>
            <input
              value={form.clienteTelefono}
              onChange={(e) => update('clienteTelefono', e.target.value)}
              placeholder="Opcional"
              className="rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>
        </div>

        <button
          type="button"
          onClick={() => setOpenStep(2)}
          disabled={!paso1Completo}
          className="rounded-lg bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
        >
          Continuar
        </button>
      </AccordionSection>

      <AccordionSection
        step={2}
        title="Servicio"
        summary={form.comboId ? combos.find((c) => c.id === form.comboId)?.nombre : 'Combo y lavador'}
        isOpen={openStep === 2}
        isComplete={paso2Completo}
        onToggle={() => toggleStep(2)}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-neutral-700">
            <Sparkles size={14} className="text-primary-500" /> Combo
          </span>
          <CustomSelect
            value={form.comboId}
            onChange={(value) => update('comboId', value)}
            disabled={!form.tipoVehiculoId}
            placeholder={form.tipoVehiculoId ? 'Selecciona…' : 'Primero elige el tipo de vehículo'}
            emptyLabel="No hay combos con precio para ese tipo"
            options={combosDisponibles.map((c) => ({ value: c.id, label: c.nombre }))}
          />
        </label>

        {precio !== undefined ? (
          <div className="flex items-center justify-between rounded-lg bg-primary-50 px-3 py-2.5 text-sm">
            <span className="font-medium text-primary-900">Precio: {COP.format(precio)}</span>
            <span className="text-xs text-primary-700">
              Lavador {COP.format(comisionLavador ?? 0)} · Negocio {COP.format(comisionNegocio ?? 0)}
            </span>
          </div>
        ) : null}
        <p className="text-xs text-neutral-400">
          El precio se cobra al entregar el vehículo, no ahora — este tiquete es solo de ingreso.
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-center gap-1.5 font-medium text-neutral-700">
            <Car size={14} className="text-primary-500" /> Lavador asignado
          </span>
          <CustomSelect
            value={form.lavadorId}
            onChange={(value) => update('lavadorId', value)}
            placeholder="Selecciona…"
            options={lavadores.filter((l) => l.activo).map((l) => ({ value: l.id, label: l.nombre }))}
          />
          <span className="text-xs text-neutral-400">Sugerido por la cola de rotación — puedes cambiarlo.</span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Observaciones</span>
          <textarea
            value={form.observaciones}
            onChange={(e) => update('observaciones', e.target.value)}
            rows={2}
            placeholder="Estado del vehículo, rayones, etc. (opcional)"
            className="resize-none rounded-lg border border-neutral-300 px-3 py-2.5 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
        </label>
      </AccordionSection>

      {error ? <p className="px-1 text-xs text-danger-600">{error}</p> : null}
      {lastTicket !== null ? <p className="px-1 text-xs text-success-700">Tiquete #{lastTicket} registrado.</p> : null}

      <button
        type="submit"
        disabled={saving || !paso1Completo || !paso2Completo}
        className="rounded-lg bg-primary-600 py-3.5 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-40"
      >
        {saving ? 'Registrando…' : 'Registrar ingreso'}
      </button>
    </form>
  )
}
