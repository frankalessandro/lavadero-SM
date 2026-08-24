import { useState } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CircleParking } from 'lucide-react'
import { fetchTarifasParqueadero, updateTarifaParqueadero } from '../../../../data/tarifasParqueadero'
import type { TarifaParqueadero } from '../../../../schemas/tarifaParqueadero'
import { Card } from '../../../../components/layout/Card'
import { CurrencyInput } from '../../../../components/layout/CurrencyInput'

export const Route = createFileRoute('/admin/catalogo/parqueadero/')({
  loader: fetchTarifasParqueadero,
  component: ParqueaderoPage,
})

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
  const [tarifas, setTarifas] = useState(initial)

  async function refresh() {
    setTarifas(await fetchTarifasParqueadero())
    router.invalidate()
  }

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
