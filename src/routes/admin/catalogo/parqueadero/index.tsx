import { useMemo, useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CircleParking, Plus, Pencil, X, AlertTriangle } from 'lucide-react'
import { fetchTarifasParqueadero, updateTarifaParqueadero } from '../../../../data/tarifasParqueadero'
import {
  fetchSuscripciones,
  createSuscripcion,
  updateSuscripcion,
  setSuscripcionActiva,
} from '../../../../data/suscripcionesParqueadero'
import {
  suscripcionInputSchema,
  estadoVigencia,
  ESTADO_VIGENCIA_LABEL,
  type EstadoVigencia,
  type SuscripcionParqueadero,
} from '../../../../schemas/suscripcionParqueadero'
import type { TarifaParqueadero } from '../../../../schemas/tarifaParqueadero'
import { Card } from '../../../../components/layout/Card'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { toast } from '../../../../lib/toast'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'

export const Route = createFileRoute('/admin/catalogo/parqueadero/')({
  loader: async () => ({
    tarifas: await fetchTarifasParqueadero(),
    suscripciones: await fetchSuscripciones(),
  }),
  component: ParqueaderoPage,
})

const FECHA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

const VIGENCIA_BADGE: Record<EstadoVigencia, string> = {
  vigente: 'bg-success-50 text-success-700',
  por_vencer: 'bg-warning-50 text-warning-700',
  vencida: 'bg-danger-50 text-danger-700',
}

const MODALIDAD_SUS_LABEL: Record<'mensualidad' | 'fijo', string> = {
  mensualidad: 'Mensualidad',
  fijo: 'Fijo 24h',
}

const MODALIDAD_LABEL: Record<TarifaParqueadero['modalidad'], string> = {
  noche: 'Noche',
  mensualidad: 'Mensualidad',
  fijo: 'Fijo 24 horas',
}

const MODALIDAD_DESCRIPCION: Record<TarifaParqueadero['modalidad'], string> = {
  noche: 'De 7:00 pm a 7:00 am. Se cobra al retiro del vehículo, no al ingreso.',
  mensualidad: 'Cobro mensual con fecha de vencimiento.',
  fijo: 'El vehículo permanece día y noche, con entradas y salidas ilimitadas.',
}

function formatPrecio(precio: number): string {
  return precio.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
}

function ParqueaderoPage() {
  const initial = Route.useLoaderData()
  const router = useRouter()
  const [tarifas, setTarifas] = useState(initial.tarifas)
  const [suscripciones, setSuscripciones] = useState(initial.suscripciones)
  const [editandoSus, setEditandoSus] = useState<SuscripcionParqueadero | null>(null)
  const [creandoSus, setCreandoSus] = useState(false)
  const [confirmandoSus, setConfirmandoSus] = useState<SuscripcionParqueadero | null>(null)

  async function refresh() {
    const [t, ss] = await Promise.all([fetchTarifasParqueadero(), fetchSuscripciones()])
    setTarifas(t)
    setSuscripciones(ss)
    router.invalidate()
  }

  const porVencer = useMemo(
    () => suscripciones.filter((x) => x.activo && estadoVigencia(x.fechaFin) !== 'vigente'),
    [suscripciones],
  )

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Tarifas de parqueadero</h2>
        <p className="text-sm text-neutral-500">
          Las tres modalidades operan de forma independiente, cada una con su propia tarifa.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tarifas.map((tarifa) => (
          <TarifaCard key={tarifa.id} tarifa={tarifa} onSaved={refresh} />
        ))}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900">Suscriptores</h2>
            <p className="text-sm text-neutral-500">
              Titulares de mensualidad y fijo 24h, con su vigencia. No se cobra por movimiento (regla 6); acá se
              controla hasta cuándo están al día.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreandoSus(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
          >
            <Plus size={16} />
            Nueva suscripción
          </button>
        </div>

        {porVencer.length > 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-warning-600/25 bg-warning-50 px-3 py-2.5 text-xs text-warning-700">
            <AlertTriangle size={14} className="shrink-0" />
            {porVencer.length} suscripción(es) vencida(s) o por vencer en los próximos 7 días.
          </p>
        ) : null}

        {suscripciones.length === 0 ? (
          <Card className="py-10 text-center text-sm text-neutral-400">Todavía no hay suscriptores.</Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-left text-xs font-medium text-neutral-500">
                  <th className="px-5 py-3">Placa</th>
                  <th className="px-5 py-3">Titular</th>
                  <th className="px-5 py-3">Modalidad</th>
                  <th className="px-5 py-3">Vigencia</th>
                  <th className="px-5 py-3">Estado</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {suscripciones.map((sus) => {
                  const estado = estadoVigencia(sus.fechaFin)
                  return (
                    <tr key={sus.id} className="border-b border-neutral-50 last:border-0 hover:bg-primary-50/40">
                      <td className="px-5 py-3 font-mono font-medium text-neutral-800">{sus.placa}</td>
                      <td className="px-5 py-3 text-neutral-700">
                        {sus.titular}
                        {sus.telefono ? <span className="block text-xs text-neutral-400">{sus.telefono}</span> : null}
                      </td>
                      <td className="px-5 py-3 text-neutral-600">{MODALIDAD_SUS_LABEL[sus.modalidad]}</td>
                      <td className="px-5 py-3 text-neutral-600">
                        {FECHA.format(new Date(`${sus.fechaInicio}T00:00:00`))} →{' '}
                        {FECHA.format(new Date(`${sus.fechaFin}T00:00:00`))}
                      </td>
                      <td className="px-5 py-3">
                        {sus.activo ? (
                          <span className={`rounded-md px-2 py-1 text-xs font-medium ${VIGENCIA_BADGE[estado]}`}>
                            {ESTADO_VIGENCIA_LABEL[estado]}
                          </span>
                        ) : (
                          <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-500">
                            Inactiva
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditandoSus(sus)}
                            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                          >
                            <Pencil size={14} />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmandoSus(sus)}
                            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
                          >
                            {sus.activo ? 'Inactivar' : 'Activar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {creandoSus || editandoSus ? (
        <SuscripcionModal
          suscripcion={editandoSus}
          onClose={() => {
            setCreandoSus(false)
            setEditandoSus(null)
          }}
          onGuardado={async () => {
            setCreandoSus(false)
            setEditandoSus(null)
            await refresh()
          }}
        />
      ) : null}

      {confirmandoSus ? (
        <ConfirmModal
          title={confirmandoSus.activo ? 'Inactivar suscripción' : 'Activar suscripción'}
          message={
            confirmandoSus.activo
              ? `${confirmandoSus.placa} · ${confirmandoSus.titular} deja de contar como suscriptor activo en la portería.`
              : `${confirmandoSus.placa} · ${confirmandoSus.titular} vuelve a contar como suscriptor activo.`
          }
          confirmLabel={confirmandoSus.activo ? 'Inactivar' : 'Activar'}
          variant={confirmandoSus.activo ? 'danger' : 'primary'}
          successMessage={confirmandoSus.activo ? 'Suscripción inactivada' : 'Suscripción activada'}
          onCancel={() => setConfirmandoSus(null)}
          onConfirm={async () => {
            await setSuscripcionActiva(confirmandoSus.id, !confirmandoSus.activo)
            setConfirmandoSus(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function SuscripcionModal({
  suscripcion,
  onClose,
  onGuardado,
}: {
  suscripcion: SuscripcionParqueadero | null
  onClose: () => void
  onGuardado: () => Promise<void>
}) {
  const [placa, setPlaca] = useState(suscripcion?.placa ?? '')
  const [titular, setTitular] = useState(suscripcion?.titular ?? '')
  const [telefono, setTelefono] = useState(suscripcion?.telefono ?? '')
  const [modalidad, setModalidad] = useState<string>(suscripcion?.modalidad ?? 'mensualidad')
  const [valor, setValor] = useState(suscripcion ? String(suscripcion.valor) : '')
  const [fechaInicio, setFechaInicio] = useState(suscripcion?.fechaInicio ?? new Date().toISOString().slice(0, 10))
  const [fechaFin, setFechaFin] = useState(suscripcion?.fechaFin ?? '')
  const [nota, setNota] = useState(suscripcion?.nota ?? '')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  const enVueloRef = useRef(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (enVueloRef.current) return
    const parsed = suscripcionInputSchema.safeParse({
      placa,
      titular,
      telefono: telefono || undefined,
      modalidad,
      valor: Number(valor || 0),
      fechaInicio,
      fechaFin,
      nota: nota || undefined,
    })
    if (!parsed.success) {
      const mapa: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const campo = issue.path[0]
        if (typeof campo === 'string' && !mapa[campo]) mapa[campo] = issue.message
      }
      setErrores(mapa)
      return
    }
    enVueloRef.current = true
    setGuardando(true)
    try {
      if (suscripcion) await updateSuscripcion(suscripcion.id, parsed.data)
      else await createSuscripcion(parsed.data, 'Admin')
      await onGuardado()
      toast.exito(suscripcion ? 'Suscripción actualizada' : 'Suscripción creada')
    } catch (err) {
      setErrores({ general: err instanceof Error ? err.message : 'No se pudo guardar' })
      toast.desdeError(err, 'No se pudo guardar')
    } finally {
      enVueloRef.current = false
      setGuardando(false)
    }
  }

  const inputCls =
    'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-neutral-900">
            {suscripcion ? 'Editar suscripción' : 'Nueva suscripción'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Placa</span>
              <input
                autoFocus
                value={placa}
                onChange={(e) => setPlaca(e.target.value.toUpperCase())}
                className={`${inputCls} font-mono uppercase`}
              />
              {errores.placa ? <span className="text-xs text-danger-600">{errores.placa}</span> : null}
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Modalidad</span>
              <CustomSelect
                size="sm"
                value={modalidad}
                onChange={setModalidad}
                options={[
                  { value: 'mensualidad', label: 'Mensualidad' },
                  { value: 'fijo', label: 'Fijo 24h' },
                ]}
                placeholder="Modalidad"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Titular</span>
            <input value={titular} onChange={(e) => setTitular(e.target.value)} className={inputCls} />
            {errores.titular ? <span className="text-xs text-danger-600">{errores.titular}</span> : null}
          </label>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Teléfono</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                className={inputCls}
                placeholder="Opcional"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Valor del periodo</span>
              <CurrencyInput size="sm" value={valor} onChange={setValor} />
            </label>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Desde</span>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Vence</span>
              <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className={inputCls} />
              {errores.fechaFin ? <span className="text-xs text-danger-600">{errores.fechaFin}</span> : null}
            </label>
          </div>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Nota</span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} className={inputCls} placeholder="Opcional" />
          </label>
          {errores.general ? (
            <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{errores.general}</p>
          ) : null}
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TarifaCard({ tarifa, onSaved }: { tarifa: TarifaParqueadero; onSaved: () => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [valor, setValor] = useState(tarifa.precio !== undefined ? String(tarifa.precio) : '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function openEdit() {
    setValor(tarifa.precio !== undefined ? String(tarifa.precio) : '')
    setError(null)
    setEditing(true)
  }

  async function handleSave() {
    const numero = Number(valor)
    if (!Number.isInteger(numero) || numero <= 0) {
      setError('Ingresa un precio válido, mayor que cero')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await updateTarifaParqueadero(tarifa.id, numero)
      setEditing(false)
      await onSaved()
      toast.exito('Tarifa actualizada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la tarifa')
      toast.desdeError(err, 'No se pudo guardar la tarifa')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <CircleParking size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">{MODALIDAD_LABEL[tarifa.modalidad]}</h3>
          <p className="text-xs text-neutral-500">{MODALIDAD_DESCRIPCION[tarifa.modalidad]}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-neutral-100 pt-4">
        {editing ? (
          <div className="flex flex-col gap-2">
            <CurrencyInput autoFocus size="sm" prefix="$" value={valor} onChange={setValor} placeholder="p. ej. 8000" />
            {error ? <p className="text-xs text-danger-600">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              {tarifa.precio !== undefined ? (
                <p className="text-xl font-semibold text-neutral-900">{formatPrecio(tarifa.precio)}</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-warning-700">Sin definir</p>
                  <p className="text-xs text-neutral-400">Pendiente de confirmación del cliente.</p>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={openEdit}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-primary-100 hover:text-primary-700"
            >
              {tarifa.precio !== undefined ? 'Editar' : 'Definir'}
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}
