import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Plus, Receipt, X } from 'lucide-react'
import { createGasto, type GastoConCategoria } from '../../data/gastos'
import { gastoInputSchema, type CategoriaGasto } from '../../schemas/gasto'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Card } from './Card'
import { CustomSelect } from './CustomSelect'
import { CurrencyInput } from './CurrencyInput'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
}

interface GastosDeTurnoProps {
  turno: TurnoCaja
  categorias: CategoriaGasto[]
  gastos: GastoConCategoria[]
  onRegistrado: (gasto: GastoConCategoria) => void
  /** 'sm' = escritorio (jefe de zona) · 'md' = mobile-first (vigilante). Ver CLAUDE.md §escalas. */
  size?: 'sm' | 'md'
}

// Caja menuda del turno abierto: lo que sale del cajón durante el turno y por lo tanto NO debe
// aparecer en el conteo físico del cierre. Cada gasto se guarda con `origen: 'caja'` y el
// `turno_id` de este turno, que es exactamente lo que `calcularValorEsperado` resta del arqueo
// (ver 0042_gastos_caja_turno.sql — hasta esa migración la columna nunca se escribía y el valor
// esperado quedaba siempre inflado).
export function GastosDeTurno({ turno, categorias, gastos, onRegistrado, size = 'sm' }: GastosDeTurnoProps) {
  const [abierto, setAbierto] = useState(false)
  const [categoriaId, setCategoriaId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [monto, setMonto] = useState('')
  const [responsable, setResponsable] = useState(turno.responsableActual ?? turno.responsable)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)
  // Guard síncrono contra doble submit: `disabled={guardando}` llega tarde con un doble clic
  // rápido porque el re-render de React es asíncrono.
  const enVueloRef = useRef(false)

  const activas = useMemo(() => categorias.filter((c) => c.activo), [categorias])
  const total = useMemo(() => gastos.reduce((suma, g) => suma + g.monto, 0), [gastos])

  const inputClass =
    size === 'sm'
      ? 'rounded-lg border border-neutral-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'
      : 'rounded-lg border border-neutral-300 px-3 py-3 text-base outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500'

  function resetForm() {
    setCategoriaId('')
    setDescripcion('')
    setMonto('')
    setResponsable(turno.responsableActual ?? turno.responsable)
    setErrores({})
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (enVueloRef.current) return

    const parsed = gastoInputSchema.safeParse({
      fecha: hoyISO(),
      categoriaId,
      descripcion,
      monto: Number(monto || 0),
      responsable,
      origen: 'caja' as const,
      turnoId: turno.id,
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
      const creado = await createGasto(parsed.data)
      onRegistrado(creado)
      resetForm()
      setAbierto(false)
    } catch (error) {
      setErrores({ general: error instanceof Error ? error.message : 'No se pudo registrar el gasto' })
    } finally {
      enVueloRef.current = false
      setGuardando(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning-50 text-warning-700">
            <Receipt size={18} />
          </span>
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-neutral-900">Gastos de este turno</h2>
            <p className="text-xs text-neutral-500">Sale del cajón — se descuenta del arqueo</p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold text-warning-700">{COP.format(total)}</p>
          <p className="text-xs text-neutral-500">
            {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
          </p>
        </div>
      </div>

      {gastos.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {gastos.map((gasto) => (
            <li
              key={gasto.id}
              className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium text-neutral-800">{gasto.descripcion}</span>
                <span className="truncate text-xs text-neutral-500">
                  {gasto.categoriaNombre} · {gasto.responsable} · {formatHora(gasto.creadoEn)}
                </span>
              </div>
              <span className="shrink-0 font-mono text-sm font-semibold text-neutral-800">
                −{COP.format(gasto.monto)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {abierto ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 border-t border-neutral-100 pt-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Categoría</span>
            <CustomSelect
              size={size}
              value={categoriaId}
              onChange={setCategoriaId}
              placeholder="Selecciona una categoría"
              options={activas.map((c) => ({ value: c.id, label: c.nombre }))}
            />
            {errores.categoriaId ? <span className="text-xs text-danger-600">{errores.categoriaId}</span> : null}
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Descripción</span>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Ej. domicilio de almuerzo"
              className={inputClass}
            />
            {errores.descripcion ? <span className="text-xs text-danger-600">{errores.descripcion}</span> : null}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Monto</span>
              <CurrencyInput value={monto} onChange={setMonto} size={size} />
              {errores.monto ? <span className="text-xs text-danger-600">{errores.monto}</span> : null}
            </label>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-neutral-700">Responsable</span>
              <input
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                className={inputClass}
              />
              {errores.responsable ? <span className="text-xs text-danger-600">{errores.responsable}</span> : null}
            </label>
          </div>

          {errores.general ? (
            <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">{errores.general}</p>
          ) : null}

          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
            <button
              type="button"
              onClick={() => {
                resetForm()
                setAbierto(false)
              }}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100"
            >
              <X size={16} />
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-nav-active transition-colors hover:bg-primary-700 disabled:opacity-60"
            >
              {guardando ? 'Guardando…' : 'Registrar gasto'}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-3 py-2.5 text-sm font-medium text-neutral-600 transition-colors hover:border-primary-400 hover:bg-primary-50/40 hover:text-primary-700"
        >
          <Plus size={16} />
          Registrar gasto
        </button>
      )}
    </Card>
  )
}
