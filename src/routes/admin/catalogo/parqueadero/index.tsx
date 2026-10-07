import { useRef, useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Pencil, AlertTriangle, Car, Bike } from 'lucide-react'
import { fetchTarifasParqueadero, updateTarifaParqueadero } from '../../../../data/tarifasParqueadero'
import type { TarifaParqueadero } from '../../../../schemas/tarifaParqueadero'
import { CLASE_VEHICULO_LABEL, type ClaseVehiculoParqueadero } from '../../../../schemas/estanciaParqueadero'
import { SuscriptoresParqueadero } from '../../../../components/parqueadero/SuscriptoresParqueadero'
import { Modal } from '../../../../components/layout/Modal'
import { Button } from '../../../../components/layout/Button'
import { Card } from '../../../../components/layout/Card'
import { PageHeader } from '../../../../components/layout/PageHeader'
import { toast } from '../../../../lib/toast'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'

export const Route = createFileRoute('/admin/catalogo/parqueadero/')({
  loader: async () => ({
    tarifas: await fetchTarifasParqueadero(),
  }),
  component: ParqueaderoPage,
})

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
  async function refresh() {
    setTarifas(await fetchTarifasParqueadero())
    router.invalidate()
  }

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

      <SuscriptoresParqueadero puedeFecharAtras />
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
