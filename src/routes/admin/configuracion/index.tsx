import { useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { fetchConfiguracion, updateConfiguracion } from '../../../data/configuracion'
import { configuracionSchema, type Configuracion } from '../../../schemas/configuracion'
import { Card } from '../../../components/layout/Card'
import { CurrencyInput } from '../../../components/layout/CurrencyInput'

export const Route = createFileRoute('/admin/configuracion/')({
  loader: fetchConfiguracion,
  component: ConfiguracionPage,
})

const BASE_OPCIONES: { value: Configuracion['comisionBase']; label: string; descripcion: string }[] = [
  {
    value: 'lista',
    label: 'Sobre precio de lista',
    descripcion: 'Opción por defecto: el negocio absorbe el descuento y el lavador recibe su comisión completa.',
  },
  {
    value: 'cobrado',
    label: 'Sobre valor cobrado',
    descripcion: 'El descuento se reparte entre el negocio y el lavador.',
  },
]

const PERIODICIDAD_OPCIONES: { value: Configuracion['periodicidadLiquidacion']; label: string; descripcion: string }[] = [
  {
    value: 'diaria',
    label: 'Diaria',
    descripcion: 'Lo normal: liquidar las comisiones de cada lavador día a día.',
  },
  {
    value: 'semanal',
    label: 'Semanal',
    descripcion: 'Acumular y liquidar cada 7 días en vez de a diario.',
  },
]

function ConfiguracionPage() {
  const initial = Route.useLoaderData()
  const [comisionPorcentaje, setComisionPorcentaje] = useState(String(initial.comisionLavadorPorcentaje * 100))
  const [comisionJefeZonaPorcentaje, setComisionJefeZonaPorcentaje] = useState(
    String(initial.comisionJefeZonaPorcentaje * 100),
  )
  const [comisionBase, setComisionBase] = useState<Configuracion['comisionBase']>(initial.comisionBase)
  const [periodicidadLiquidacion, setPeriodicidadLiquidacion] = useState<Configuracion['periodicidadLiquidacion']>(
    initial.periodicidadLiquidacion,
  )
  const [recargoAltoCilindraje, setRecargoAltoCilindraje] = useState(String(initial.recargoAltoCilindraje))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const numero = Number(comisionPorcentaje)
    if (!Number.isFinite(numero) || numero <= 0 || numero > 100) {
      setError('Ingresa un porcentaje válido entre 0 y 100')
      return
    }
    const numeroJefeZona = Number(comisionJefeZonaPorcentaje)
    if (!Number.isFinite(numeroJefeZona) || numeroJefeZona < 0 || numeroJefeZona >= 100) {
      setError('Ingresa un porcentaje de jefe de patio válido entre 0 y 100')
      return
    }
    const parsed = configuracionSchema.safeParse({
      comisionLavadorPorcentaje: numero / 100,
      comisionJefeZonaPorcentaje: numeroJefeZona / 100,
      comisionBase,
      periodicidadLiquidacion,
      recargoAltoCilindraje: Number(recargoAltoCilindraje) || 0,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    setError(null)
    setSaving(true)
    setSaved(false)
    try {
      await updateConfiguracion(parsed.data)
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Configuración</h2>
        <p className="text-sm text-neutral-500">
          Porcentaje de comisión del lavador y base de cálculo cuando haya descuentos.
        </p>
      </div>

      <Card className="max-w-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Comisión del lavador (%)</span>
            <p className="text-xs text-neutral-500">
              Porcentaje de cada combo que corresponde al lavador; el resto queda para el negocio y el jefe de patio.
            </p>
            <input
              inputMode="decimal"
              value={comisionPorcentaje}
              onChange={(event) => {
                setComisionPorcentaje(event.target.value)
                setSaved(false)
              }}
              placeholder="p. ej. 40"
              className="mt-1 w-32 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Comisión del jefe de patio en turno (%)</span>
            <p className="text-xs text-neutral-500">
              Porcentaje de cada orden para quien esté a cargo del turno de recepción al registrar el vehículo —
              el negocio se lleva lo que queda después de esta y la del lavador.
            </p>
            <input
              inputMode="decimal"
              value={comisionJefeZonaPorcentaje}
              onChange={(event) => {
                setComisionJefeZonaPorcentaje(event.target.value)
                setSaved(false)
              }}
              placeholder="p. ej. 3"
              className="mt-1 w-32 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </label>

          <div className="flex flex-col gap-2 text-left text-sm">
            <span className="font-medium text-neutral-700">Base de cálculo de la comisión</span>
            <p className="text-xs text-neutral-500">
              Aplica cuando se habiliten descuentos (hoy desactivados por defecto).
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {BASE_OPCIONES.map((opcion) => (
                <button
                  key={opcion.value}
                  type="button"
                  onClick={() => {
                    setComisionBase(opcion.value)
                    setSaved(false)
                  }}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                    comisionBase === opcion.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      comisionBase === opcion.value ? 'text-primary-700' : 'text-neutral-900'
                    }`}
                  >
                    {opcion.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">{opcion.descripcion}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 text-left text-sm">
            <span className="font-medium text-neutral-700">Periodicidad de liquidación</span>
            <p className="text-xs text-neutral-500">
              Rango que propone por defecto "Generar liquidación" en Liquidaciones — liquidar sigue siendo manual y
              opcional, esto solo fija cuál es lo normal.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              {PERIODICIDAD_OPCIONES.map((opcion) => (
                <button
                  key={opcion.value}
                  type="button"
                  onClick={() => {
                    setPeriodicidadLiquidacion(opcion.value)
                    setSaved(false)
                  }}
                  className={`flex-1 rounded-lg border px-4 py-3 text-left transition-colors ${
                    periodicidadLiquidacion === opcion.value
                      ? 'border-primary-500 bg-primary-50'
                      : 'border-neutral-200 hover:border-neutral-300'
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      periodicidadLiquidacion === opcion.value ? 'text-primary-700' : 'text-neutral-900'
                    }`}
                  >
                    {opcion.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-neutral-500">{opcion.descripcion}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-neutral-700">Recargo moto alto cilindraje</span>
            <p className="text-xs text-neutral-500">
              Se suma al precio cuando en recepción se marca el checkbox "Alto cilindraje" para una moto —
              mismo monto sin importar el combo.
            </p>
            <div className="mt-1 w-40">
              <CurrencyInput
                size="sm"
                value={recargoAltoCilindraje}
                onChange={(value) => {
                  setRecargoAltoCilindraje(value)
                  setSaved(false)
                }}
              />
            </div>
          </label>

          {error ? <p className="text-xs text-danger-600">{error}</p> : null}
          {saved ? <p className="text-xs text-success-700">Configuración guardada.</p> : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  )
}
