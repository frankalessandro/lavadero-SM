import { useMemo, useRef, useState, type FormEvent } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Plus, Pencil, X, AlertTriangle, Car, Bike } from 'lucide-react'
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
import { CLASE_VEHICULO_LABEL, type ClaseVehiculoParqueadero } from '../../../../schemas/estanciaParqueadero'
import { Modal } from '../../../../components/layout/Modal'
import { Button } from '../../../../components/layout/Button'
import { Card } from '../../../../components/layout/Card'
import { CustomSelect } from '../../../../components/layout/CustomSelect'
import { ConfirmModal } from '../../../../components/layout/ConfirmModal'
import { PageHeader } from '../../../../components/layout/PageHeader'
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
      <PageHeader
        title="Tarifas de parqueadero"
        description="Lo que paga cada vehículo según su clase y modalidad, y la multa por salir tarde."
        help={{
          body: 'Noche: de 7:00 pm a 7:00 am, se cobra al retirar el vehículo. Mensualidad y fijo 24h se cobran aparte a cada suscriptor (sección de abajo).\n\nLa multa aplica a noche y mensualidad cuando el vehículo sale después de las 8:00 am siguientes a su ingreso. Mientras esté en $0, el sistema solo avisa.',
        }}
      />

      <TarifasPorClase tarifas={tarifas} onSaved={refresh} />

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
            className="flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700"
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="max-h-[92vh] sm:max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white p-6 shadow-card-hover sm:p-7">
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
              className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Tarifas por clase de vehículo (0075): una tarjeta por clase con sus tres modalidades y la multa.
// La multa se edita una vez por clase y se guarda en las filas de noche y mensualidad (las dos
// modalidades con ventana de salida, regla 7); fijo 24h nunca paga multa.
function TarifasPorClase({ tarifas, onSaved }: { tarifas: TarifaParqueadero[]; onSaved: () => Promise<void> }) {
  const [editando, setEditando] = useState<ClaseVehiculoParqueadero | null>(null)
  const de = (clase: ClaseVehiculoParqueadero, modalidad: TarifaParqueadero['modalidad']) =>
    tarifas.find((t) => t.claseVehiculo === clase && t.modalidad === modalidad)

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {(Object.keys(CLASE_VEHICULO_LABEL) as ClaseVehiculoParqueadero[]).map((clase) => {
          const multa = de(clase, 'noche')?.multaFueraVentana ?? 0
          return (
            <Card key={clase} className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                    {clase === 'carro' ? <Car size={18} /> : <Bike size={18} />}
                  </span>
                  <h3 className="text-sm font-semibold text-neutral-900">{CLASE_VEHICULO_LABEL[clase]}</h3>
                </div>
                <Button size="sm" icon={Pencil} onClick={() => setEditando(clase)}>
                  Editar
                </Button>
              </div>
              <ul className="flex flex-col divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                {(['noche', 'mensualidad', 'fijo'] as const).map((modalidad) => {
                  const precio = de(clase, modalidad)?.precio
                  return (
                    <li key={modalidad} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                      <span className="text-neutral-600">{MODALIDAD_LABEL[modalidad]}</span>
                      {precio !== undefined ? (
                        <span className="font-semibold tabular-nums text-neutral-900">{formatPrecio(precio)}</span>
                      ) : (
                        <span className="text-xs font-medium text-warning-700">Sin definir</span>
                      )}
                    </li>
                  )
                })}
                <li className="flex items-center justify-between gap-3 bg-neutral-50/60 px-3 py-2.5 text-sm">
                  <span className="flex items-center gap-1.5 text-neutral-600">
                    <AlertTriangle size={13} className="text-warning-600" /> Multa fuera de ventana
                  </span>
                  {multa > 0 ? (
                    <span className="font-semibold tabular-nums text-neutral-900">{formatPrecio(multa)}</span>
                  ) : (
                    <span className="text-xs text-neutral-400">Solo aviso</span>
                  )}
                </li>
              </ul>
            </Card>
          )
        })}
      </div>

      {editando ? (
        <EditarTarifasModal
          clase={editando}
          tarifas={tarifas.filter((t) => t.claseVehiculo === editando)}
          onClose={() => setEditando(null)}
          onSaved={async () => {
            setEditando(null)
            await onSaved()
          }}
        />
      ) : null}
    </>
  )
}

function EditarTarifasModal({
  clase,
  tarifas,
  onClose,
  onSaved,
}: {
  clase: ClaseVehiculoParqueadero
  tarifas: TarifaParqueadero[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const fila = (m: TarifaParqueadero['modalidad']) => tarifas.find((t) => t.modalidad === m)
  const [precios, setPrecios] = useState<Record<TarifaParqueadero['modalidad'], string>>({
    noche: fila('noche')?.precio !== undefined ? String(fila('noche')?.precio) : '',
    mensualidad: fila('mensualidad')?.precio !== undefined ? String(fila('mensualidad')?.precio) : '',
    fijo: fila('fijo')?.precio !== undefined ? String(fila('fijo')?.precio) : '',
  })
  const [multa, setMulta] = useState(String(fila('noche')?.multaFueraVentana ?? 0))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const enVuelo = useRef(false)

  async function guardar() {
    if (enVuelo.current) return
    for (const m of ['noche', 'mensualidad', 'fijo'] as const) {
      if (precios[m] !== '' && !(Number(precios[m]) > 0)) {
        setError(`El precio de ${MODALIDAD_LABEL[m].toLowerCase()} debe ser mayor que cero (o déjalo vacío si aún no se define).`)
        return
      }
    }
    const valorMulta = Number(multa || 0)
    if (!Number.isInteger(valorMulta) || valorMulta < 0) {
      setError('La multa no puede ser negativa.')
      return
    }
    setError(null)
    enVuelo.current = true
    setSaving(true)
    try {
      for (const t of tarifas) {
        const cambios: { precio?: number; multaFueraVentana?: number } = {}
        if (precios[t.modalidad] !== '' && Number(precios[t.modalidad]) !== t.precio) cambios.precio = Number(precios[t.modalidad])
        const multaFila = t.modalidad === 'fijo' ? 0 : valorMulta
        if (multaFila !== t.multaFueraVentana) cambios.multaFueraVentana = multaFila
        if (Object.keys(cambios).length > 0) await updateTarifaParqueadero(t.id, cambios)
      }
      toast.exito(`Tarifas de ${CLASE_VEHICULO_LABEL[clase].toLowerCase()} actualizadas`)
      await onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar las tarifas')
      toast.desdeError(err, 'No se pudieron guardar las tarifas')
    } finally {
      enVuelo.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Tarifas · ${CLASE_VEHICULO_LABEL[clase]}`}
      subtitle="Los cambios rigen para las salidas desde ahora y quedan en la bitácora."
      icon={clase === 'carro' ? Car : Bike}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={guardar}>
            Guardar tarifas
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {(['noche', 'mensualidad', 'fijo'] as const).map((m) => (
            <label key={m} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">{MODALIDAD_LABEL[m]}</span>
              <CurrencyInput size="sm" value={precios[m]} onChange={(v) => setPrecios((p) => ({ ...p, [m]: v }))} placeholder="Sin definir" />
            </label>
          ))}
        </div>
        <p className="-mt-2 text-xs text-neutral-500">
          Solo la noche se cobra en cada salida. Mensualidad y fijo son precios de referencia: se cobran aparte, a
          cada suscriptor.
        </p>
        <label className="flex flex-col gap-1.5 border-t border-neutral-100 pt-4 text-sm">
          <span className="font-medium text-neutral-700">Multa por salir después de las 8:00 am</span>
          <div className="sm:w-52">
            <CurrencyInput size="sm" value={multa} onChange={setMulta} placeholder="0" />
          </div>
          <span className="text-xs text-neutral-500">
            Aplica a noche y mensualidad. En $0 el vigilante solo ve el aviso "Fuera de ventana"; con un valor, se suma
            sola al cobro de salida.
          </span>
        </label>
        {error ? <p className="text-xs text-danger-600">{error}</p> : null}
      </div>
    </Modal>
  )
}
