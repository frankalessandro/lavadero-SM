import { useRef, useState, type ComponentType, type FormEvent, type ReactNode } from 'react'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AlertTriangle, CalendarClock, ChevronDown, History, Percent, Save, Bike, Users, ShieldCheck, Building2 } from 'lucide-react'
import {
  fetchConfiguracion,
  updateConfiguracion,
  fetchConfiguracionHistorial,
  type ConfiguracionHistorial,
} from '../../../data/configuracion'
import { configuracionSchema, type Configuracion } from '../../../schemas/configuracion'
import { Card } from '../../../components/layout/Card'
import { CurrencyInput } from '../../../components/layout/CurrencyInput'
import { PageHeader } from '../../../components/layout/PageHeader'
import { Button } from '../../../components/layout/Button'
import { Modal } from '../../../components/layout/Modal'
import { toast } from '../../../lib/toast'
import { COP } from '../../../lib/formato'

export const Route = createFileRoute('/admin/configuracion/')({
  loader: async () => ({
    configuracion: await fetchConfiguracion(),
    historial: await fetchConfiguracionHistorial(),
  }),
  component: ConfiguracionPage,
})

const FECHA_HORA = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

// Precio de ejemplo para la vista previa del reparto. Solo ilustra: el reparto real se calcula
// sobre el precio de lista de cada orden.
const PRECIO_EJEMPLO = 40000

type Icono = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>

interface Formulario {
  lavador: string
  jefeCombo1: string
  jefeCombo2: string
  jefeServicios: string
  comisionBase: Configuracion['comisionBase']
  periodicidad: Configuracion['periodicidadLiquidacion']
  recargo: string
}

// Porcentajes en la UI (0–100, como string para permitir "2,5" a medio escribir); en BD van 0–1.
function aFormulario(c: Configuracion): Formulario {
  const pct = (n: number) => String(Math.round(n * 1000) / 10)
  return {
    lavador: pct(c.comisionLavadorPorcentaje),
    jefeCombo1: pct(c.comisionJefeZonaCombo1Porcentaje),
    jefeCombo2: pct(c.comisionJefeZonaCombo2Porcentaje),
    jefeServicios: pct(c.comisionJefeZonaServiciosPorcentaje),
    comisionBase: c.comisionBase,
    periodicidad: c.periodicidadLiquidacion,
    recargo: String(c.recargoAltoCilindraje),
  }
}

function num(s: string): number {
  return Number(s.replace(',', '.'))
}

function ConfiguracionPage() {
  const { configuracion, historial } = Route.useLoaderData()
  const router = useRouter()
  const [base, setBase] = useState<Formulario>(() => aFormulario(configuracion))
  const [form, setForm] = useState<Formulario>(base)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)
  const [avanzado, setAvanzado] = useState(false)
  const [tramoEjemplo, setTramoEjemplo] = useState<'combo1' | 'combo2'>('combo2')
  const enVuelo = useRef(false)

  const sucio = (Object.keys(form) as (keyof Formulario)[]).some((k) => form[k] !== base[k])

  function set<K extends keyof Formulario>(k: K, v: Formulario[K]) {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVuelo.current) return
    const lavador = num(form.lavador)
    const campos: [string, number][] = [
      ['la comisión del lavador', lavador],
      ['jefe de patio · Combo 1', num(form.jefeCombo1)],
      ['jefe de patio · Combo 2 en adelante', num(form.jefeCombo2)],
      ['jefe de patio · servicios sueltos', num(form.jefeServicios)],
    ]
    for (const [nombre, v] of campos) {
      if (!Number.isFinite(v) || v < 0 || v >= 100) {
        setError(`Revisa ${nombre}: debe ser un porcentaje entre 0 y 100.`)
        return
      }
    }
    if (lavador <= 0) {
      setError('La comisión del lavador debe ser mayor que 0.')
      return
    }
    if (lavador + Math.max(num(form.jefeCombo1), num(form.jefeCombo2)) >= 100) {
      setError('Lavador + jefe de patio no pueden sumar 100% o más: al negocio no le quedaría nada.')
      return
    }
    const parsed = configuracionSchema.safeParse({
      comisionLavadorPorcentaje: lavador / 100,
      comisionJefeZonaCombo1Porcentaje: num(form.jefeCombo1) / 100,
      comisionJefeZonaCombo2Porcentaje: num(form.jefeCombo2) / 100,
      comisionJefeZonaServiciosPorcentaje: num(form.jefeServicios) / 100,
      comisionBase: form.comisionBase,
      periodicidadLiquidacion: form.periodicidad,
      recargoAltoCilindraje: Number(form.recargo) || 0,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      return
    }
    enVuelo.current = true
    setSaving(true)
    try {
      await updateConfiguracion(parsed.data)
      setBase(form)
      toast.exito('Configuración guardada — rige desde ahora')
      await router.invalidate()
    } catch (err) {
      // Pantalla más sensible del sistema: un cambio de comisión que falla nunca puede perderse en silencio.
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración')
      toast.desdeError(err, 'No se pudo guardar la configuración')
    } finally {
      enVuelo.current = false
      setSaving(false)
    }
  }

  const pLavador = clamp(num(form.lavador))
  const pJefe = clamp(num(tramoEjemplo === 'combo1' ? form.jefeCombo1 : form.jefeCombo2))
  const pNegocio = Math.max(0, 100 - pLavador - pJefe)

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-24 text-left">
      <PageHeader
        title="Configuración"
        description="Las reglas con las que el sistema reparte cada cobro y liquida al personal."
        help={{
          body:
            'Cada cambio rige desde el momento en que se guarda; las órdenes ya registradas conservan la comisión con la que se crearon.\n\n' +
            'Solo gerencia puede cambiar esta pantalla (el jefe de patio no tiene acceso). Cada cambio queda en el historial y en Operación › Auditoría con quién lo hizo.',
        }}
        actions={
          <Button icon={History} onClick={() => setVerHistorial(true)}>
            Historial
            {historial.length > 1 ? (
              <span className="rounded-full bg-neutral-100 px-1.5 text-[11px] font-semibold text-neutral-600">{historial.length}</span>
            ) : null}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-6">
          {/* 1 · Reparto */}
          <Bloque
            icon={Percent}
            titulo="Reparto de cada lavado"
            descripcion="Qué porcentaje del precio de lista se lleva cada quien. El negocio se queda con el resto."
          >
            <Campo
              icon={Users}
              label="Lavador"
              ayuda="Igual para todos los combos. Si lavan entre dos, se reparte 50/50."
            >
              <InputPorcentaje value={form.lavador} onChange={(v) => set('lavador', v)} />
            </Campo>

            <div className="border-t border-neutral-100 pt-5">
              <div className="mb-3 flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
                  <ShieldCheck size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium text-neutral-900">Jefe de patio en turno</p>
                  <p className="text-xs text-neutral-500">
                    Para quien tenía la caja de recepción abierta cuando se registró el vehículo.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Tramo
                  label="Combo 1"
                  hint="El lavado básico de cada categoría"
                  value={form.jefeCombo1}
                  onChange={(v) => set('jefeCombo1', v)}
                  negocio={100 - clamp(num(form.lavador)) - clamp(num(form.jefeCombo1))}
                />
                <Tramo
                  label="Combo 2 en adelante"
                  hint="Cualquier combo superior"
                  value={form.jefeCombo2}
                  onChange={(v) => set('jefeCombo2', v)}
                  negocio={100 - clamp(num(form.lavador)) - clamp(num(form.jefeCombo2))}
                />
                <Tramo
                  label="Servicios sueltos"
                  hint="Sin combo o agregados a uno"
                  value={form.jefeServicios}
                  onChange={(v) => set('jefeServicios', v)}
                />
              </div>
            </div>
          </Bloque>

          {/* 2 · Liquidaciones */}
          <Bloque
            icon={CalendarClock}
            titulo="Liquidaciones"
            descripcion="El corte que se resalta por defecto al generar una liquidación. Liquidar sigue siendo manual: las dos opciones están siempre disponibles."
          >
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-neutral-100 p-1 sm:max-w-sm">
              {(['diaria', 'semanal'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('periodicidad', p)}
                  className={`rounded-lg px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
                    form.periodicidad === p ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </Bloque>

          {/* 3 · Recargos */}
          <Bloque
            icon={Bike}
            titulo="Recargos"
            descripcion="Montos fijos que se suman al precio en recepción."
          >
            <Campo
              label="Moto de alto cilindraje"
              ayuda='Se suma cuando en recepción se marca "Alto cilindraje". Mismo monto para cualquier combo, y entra al reparto como el resto del precio.'
            >
              <div className="w-full sm:w-44">
                <CurrencyInput size="sm" value={form.recargo} onChange={(v) => set('recargo', v)} />
              </div>
            </Campo>
          </Bloque>

          {/* 4 · Avanzado */}
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white/60">
            <button
              type="button"
              onClick={() => setAvanzado((a) => !a)}
              aria-expanded={avanzado}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium text-neutral-600"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={15} className="text-warning-600" />
                Avanzado · base de cálculo con descuentos
              </span>
              <ChevronDown size={16} className={`text-neutral-400 transition-transform ${avanzado ? 'rotate-180' : ''}`} />
            </button>
            {avanzado ? (
            <div className="flex flex-col gap-3 border-t border-neutral-200 px-5 py-4">
              <p className="rounded-xl bg-warning-50 px-3 py-2.5 text-xs leading-relaxed text-warning-700">
                <strong className="font-semibold">Hoy no tiene efecto.</strong> Las comisiones se calculan siempre sobre
                el precio de lista y el negocio absorbe los descuentos. Este ajuste se guarda pero ningún cálculo lo usa todavía.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    { value: 'lista', label: 'Sobre precio de lista', desc: 'El negocio absorbe el descuento.' },
                    { value: 'cobrado', label: 'Sobre valor cobrado', desc: 'El descuento se reparte con el lavador.' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => set('comisionBase', o.value)}
                    className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                      form.comisionBase === o.value ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white hover:border-neutral-300'
                    }`}
                  >
                    <span className={`block text-sm font-medium ${form.comisionBase === o.value ? 'text-primary-700' : 'text-neutral-800'}`}>
                      {o.label}
                    </span>
                    <span className="block text-xs text-neutral-500">{o.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            ) : null}
          </div>
        </div>

        {/* Vista previa */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Vista previa</p>
              <p className="mt-1 text-sm text-neutral-700">
                Así se reparte un lavado de <span className="font-semibold text-neutral-900">{COP.format(PRECIO_EJEMPLO)}</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1">
              {(
                [
                  { v: 'combo1', l: 'Combo 1' },
                  { v: 'combo2', l: 'Combo 2+' },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTramoEjemplo(t.v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    tramoEjemplo === t.v ? 'bg-white text-primary-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  {t.l}
                </button>
              ))}
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-neutral-100">
              <div className="bg-primary-500 transition-all" style={{ width: `${pLavador}%` }} />
              <div className="bg-warning-600 transition-all" style={{ width: `${pJefe}%` }} />
              <div className="bg-success-600 transition-all" style={{ width: `${pNegocio}%` }} />
            </div>
            <ul className="flex flex-col gap-2.5 text-sm">
              <FilaReparto color="bg-primary-500" icon={Users} label="Lavador" pct={pLavador} />
              <FilaReparto color="bg-warning-600" icon={ShieldCheck} label="Jefe de patio" pct={pJefe} />
              <FilaReparto color="bg-success-600" icon={Building2} label="Negocio" pct={pNegocio} fuerte />
            </ul>
            {num(form.recargo) > 0 ? (
              <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                Moto de alto cilindraje: + {COP.format(num(form.recargo))} al precio.
              </p>
            ) : null}
          </Card>
        </aside>
      </div>

      {/* Barra de guardado: solo aparece con cambios pendientes */}
      {sucio || error ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-neutral-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,23,42,0.15)] backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className={`text-sm ${error ? 'text-danger-600' : 'text-neutral-600'}`}>
              {error ?? 'Tienes cambios sin guardar. Rigen para las órdenes nuevas desde que guardes.'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setForm(base)
                  setError(null)
                }}
                disabled={saving}
              >
                Descartar
              </Button>
              <Button variant="primary" type="submit" icon={Save} loading={saving} disabled={!sucio} className="flex-1 sm:flex-none">
                Guardar cambios
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {verHistorial ? <HistorialModal historial={historial} onClose={() => setVerHistorial(false)} /> : null}
    </form>
  )
}

function clamp(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

function fmtPct(n: number): string {
  return `${Math.round(n * 10) / 10}%`.replace('.', ',')
}

function Bloque({ icon: Icon, titulo, descripcion, children }: { icon: Icono; titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <Card className="p-0">
      <div className="flex items-start gap-3 border-b border-neutral-100 px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon size={17} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900">{titulo}</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">{descripcion}</p>
        </div>
      </div>
      <div className="flex flex-col gap-5 px-5 py-5">{children}</div>
    </Card>
  )
}

function Campo({ icon: Icon, label, ayuda, children }: { icon?: Icono; label: string; ayuda?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500">
            <Icon size={16} />
          </span>
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-900">{label}</p>
          {ayuda ? <p className="text-xs text-neutral-500">{ayuda}</p> : null}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function InputPorcentaje({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex w-full items-center rounded-lg border border-neutral-300 bg-white px-3 transition-colors focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 sm:w-28">
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className="min-w-0 flex-1 bg-transparent py-2.5 text-right text-sm font-semibold tabular-nums text-neutral-900 outline-none"
      />
      <span className="pl-1.5 text-sm text-neutral-400">%</span>
    </div>
  )
}

function Tramo({
  label,
  hint,
  value,
  onChange,
  negocio,
}: {
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  negocio?: number
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-neutral-50/60 p-3">
      <div>
        <p className="text-sm font-medium text-neutral-800">{label}</p>
        <p className="text-[11px] text-neutral-500">{hint}</p>
      </div>
      <div className="[&>div]:w-full">
        <InputPorcentaje value={value} onChange={onChange} />
      </div>
      {negocio !== undefined ? (
        <p className="text-[11px] text-neutral-500">
          Negocio: <span className="font-semibold tabular-nums text-success-700">{fmtPct(Math.max(0, negocio))}</span>
        </p>
      ) : (
        <p className="text-[11px] text-neutral-400">El lavador cobra su % aparte.</p>
      )}
    </div>
  )
}

function FilaReparto({
  color,
  icon: Icon,
  label,
  pct,
  fuerte = false,
}: {
  color: string
  icon: Icono
  label: string
  pct: number
  fuerte?: boolean
}) {
  return (
    <li className="flex items-center gap-3">
      <span className={`size-2.5 shrink-0 rounded-full ${color}`} />
      <Icon size={15} className="shrink-0 text-neutral-400" />
      <span className="flex-1 text-neutral-600">{label}</span>
      <span className="w-12 text-right text-xs tabular-nums text-neutral-400">{fmtPct(pct)}</span>
      <span className={`w-24 text-right tabular-nums ${fuerte ? 'font-semibold text-neutral-900' : 'font-medium text-neutral-700'}`}>
        {COP.format(Math.round((PRECIO_EJEMPLO * pct) / 100))}
      </span>
    </li>
  )
}

// Línea de tiempo de la config (0052). Cada fila muestra SOLO lo que cambió respecto a la anterior;
// la bitácora (Auditoría) registra quién hizo cada cambio.
function HistorialModal({ historial, onClose }: { historial: ConfiguracionHistorial[]; onClose: () => void }) {
  return (
    <Modal title="Historial de configuración" subtitle="Qué regía desde cada fecha. Quién lo cambió: Operación › Auditoría." icon={History} size="md" onClose={onClose}>
      <ol className="relative flex flex-col gap-4 border-l border-neutral-200 pl-5">
        {historial.map((h, i) => {
          const previo = historial[i + 1]
          const cambios = previo ? diferencias(previo, h) : null
          return (
            <li key={h.id} className="relative">
              <span
                className={`absolute top-1 -left-[1.6rem] size-3 rounded-full border-2 border-white ${i === 0 ? 'bg-primary-600' : 'bg-neutral-300'}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-neutral-900">{FECHA_HORA.format(new Date(h.vigenteDesde))}</span>
                {i === 0 ? (
                  <span className="rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-medium text-primary-700">Vigente</span>
                ) : null}
              </div>
              {cambios === null ? (
                <p className="mt-1 text-xs text-neutral-500">Configuración inicial.</p>
              ) : cambios.length === 0 ? (
                <p className="mt-1 text-xs text-neutral-400">Guardado sin cambios.</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {cambios.map((c) => (
                    <li key={c.campo} className="text-xs text-neutral-600">
                      {c.campo}: <span className="text-neutral-400 line-through">{c.antes}</span>{' '}
                      <span className="text-neutral-300">→</span> <span className="font-semibold text-neutral-900">{c.despues}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </Modal>
  )
}

function diferencias(a: ConfiguracionHistorial, b: ConfiguracionHistorial): { campo: string; antes: string; despues: string }[] {
  const pct = (n: number | undefined) => (n === undefined ? '—' : fmtPct(n * 100))
  const campos: [string, string, string][] = [
    ['Lavador', pct(a.comisionLavadorPorcentaje), pct(b.comisionLavadorPorcentaje)],
    ['Jefe de patio · Combo 1', pct(a.comisionJefeZonaCombo1Porcentaje), pct(b.comisionJefeZonaCombo1Porcentaje)],
    ['Jefe de patio · Combo 2+', pct(a.comisionJefeZonaCombo2Porcentaje), pct(b.comisionJefeZonaCombo2Porcentaje)],
    ['Jefe de patio · servicios sueltos', pct(a.comisionJefeZonaServiciosPorcentaje), pct(b.comisionJefeZonaServiciosPorcentaje)],
    ['Liquidación', a.periodicidadLiquidacion, b.periodicidadLiquidacion],
    ['Recargo alto cilindraje', COP.format(a.recargoAltoCilindraje), COP.format(b.recargoAltoCilindraje)],
    ['Base de cálculo', a.comisionBase === 'lista' ? 'precio de lista' : 'valor cobrado', b.comisionBase === 'lista' ? 'precio de lista' : 'valor cobrado'],
  ]
  return campos.filter(([, x, y]) => x !== y).map(([campo, antes, despues]) => ({ campo, antes, despues }))
}
