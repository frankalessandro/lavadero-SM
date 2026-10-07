import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { fechaLocalISO } from '../../lib/periodo'

interface DatePickerProps {
  /** `YYYY-MM-DD`, o vacío si no hay fecha. */
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  /** Fechas fuera de [min, max] (ambas `YYYY-MM-DD`, inclusivas) no se pueden elegir. */
  min?: string
  max?: string
}

const SIZE_CLASSNAME: Record<'sm' | 'md', string> = {
  sm: 'px-3 py-2.5 text-sm',
  md: 'px-3 py-3 text-base',
}

const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const ANCHO_PANEL = 296
const ALTO_PANEL = 340

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatear(iso: string): string {
  return parse(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

interface Posicion {
  left: number
  top?: number
  bottom?: number
}

// Calendario propio en vez del `<input type="date">` del sistema operativo: mismo lenguaje visual
// que `CustomSelect` (botón + panel flotante en un portal, así un modal con scroll no lo recorta).
export function DatePicker({ value, onChange, placeholder = 'Elige una fecha', disabled, size = 'sm', min, max }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Posicion | null>(null)
  const inicial = value ? parse(value) : new Date()
  const [mes, setMes] = useState({ anio: inicial.getFullYear(), mes0: inicial.getMonth() })
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const hoyISO = fechaLocalISO(new Date())

  // Igual que CustomSelect: cierra al hacer scroll fuera del panel o al redimensionar, porque la
  // posición fija se calculó al abrir.
  useEffect(() => {
    if (!open) return
    const cerrar = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('scroll', cerrar, { capture: true, passive: true })
    window.addEventListener('resize', cerrar)
    return () => {
      window.removeEventListener('scroll', cerrar, { capture: true })
      window.removeEventListener('resize', cerrar)
    }
  }, [open])

  function abrir() {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect) return
    const base = value ? parse(value) : new Date()
    setMes({ anio: base.getFullYear(), mes0: base.getMonth() })
    const abajo = window.innerHeight - rect.bottom - 12
    const haciaArriba = abajo < ALTO_PANEL && rect.top - 12 > abajo
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - ANCHO_PANEL - 8))
    setPos(haciaArriba ? { left, bottom: window.innerHeight - rect.top + 6 } : { left, top: rect.bottom + 6 })
    setOpen(true)
  }

  function irAMes(delta: number) {
    const d = new Date(mes.anio, mes.mes0 + delta, 1)
    setMes({ anio: d.getFullYear(), mes0: d.getMonth() })
  }

  function elegir(iso: string) {
    onChange(iso)
    setOpen(false)
  }

  const primerDia = (new Date(mes.anio, mes.mes0, 1).getDay() + 6) % 7 // lunes = 0
  const diasEnMes = new Date(mes.anio, mes.mes0 + 1, 0).getDate()
  const celdas: (number | null)[] = [
    ...Array.from({ length: primerDia }, () => null),
    ...Array.from({ length: diasEnMes }, (_, i) => i + 1),
  ]
  const tituloMes = capitalizar(new Date(mes.anio, mes.mes0, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }))
  const fueraDeRango = (iso: string) => (!!min && iso < min) || (!!max && iso > max)

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : abrir())}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 bg-white text-left outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:bg-neutral-50 disabled:text-neutral-400 ${SIZE_CLASSNAME[size]}`}
      >
        <span className={`min-w-0 truncate ${value ? 'text-neutral-900' : 'text-neutral-400'}`}>
          {value ? formatear(value) : placeholder}
        </span>
        <CalendarDays size={16} className="shrink-0 text-neutral-400" />
      </button>

      {open && pos
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => setOpen(false)}
                onTouchMove={() => setOpen(false)}
                className="fixed inset-0 z-[60] cursor-default"
              />
              <div
                ref={panelRef}
                style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: ANCHO_PANEL }}
                className="fixed z-[61] rounded-xl border border-neutral-200 bg-white p-3 text-left shadow-card-hover"
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => irAMes(-1)}
                    aria-label="Mes anterior"
                    className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-sm font-semibold text-neutral-900">{tituloMes}</span>
                  <button
                    type="button"
                    onClick={() => irAMes(1)}
                    aria-label="Mes siguiente"
                    className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {DIAS.map((d, i) => (
                    <span key={i} className="py-1 text-center text-[11px] font-medium text-neutral-400">
                      {d}
                    </span>
                  ))}
                  {celdas.map((dia, i) => {
                    if (dia === null) return <span key={`v${i}`} />
                    const iso = `${mes.anio}-${String(mes.mes0 + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
                    const elegido = iso === value
                    const esHoy = iso === hoyISO
                    const bloqueado = fueraDeRango(iso)
                    return (
                      <button
                        key={iso}
                        type="button"
                        disabled={bloqueado}
                        onClick={() => elegir(iso)}
                        className={`flex size-9 items-center justify-center rounded-lg text-sm transition-colors ${
                          elegido
                            ? 'bg-primary-600 font-semibold text-white shadow-nav-active'
                            : bloqueado
                              ? 'cursor-not-allowed text-neutral-300'
                              : esHoy
                                ? 'bg-primary-50 font-semibold text-primary-700 hover:bg-primary-100'
                                : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        {dia}
                      </button>
                    )
                  })}
                </div>

                {!fueraDeRango(hoyISO) ? (
                  <button
                    type="button"
                    onClick={() => elegir(hoyISO)}
                    className="mt-2 w-full rounded-lg py-2 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-50"
                  >
                    Hoy
                  </button>
                ) : null}
              </div>
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
