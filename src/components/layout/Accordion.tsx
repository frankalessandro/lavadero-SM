import { ChevronDown, Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'

interface AccordionSectionProps {
  step: number
  title: string
  summary?: string
  isOpen: boolean
  isComplete: boolean
  onToggle: () => void
  children: ReactNode
}

// Acordeón propio (no un <details> nativo): numera los pasos, muestra un resumen
// cuando está cerrado y anima el alto con la técnica grid-rows (sin medir con JS).
export function AccordionSection({ step, title, summary, isOpen, isComplete, onToggle, children }: AccordionSectionProps) {
  // `overflow-hidden` solo debe estar activo mientras la sección está cerrada o animando
  // (lo necesita la técnica grid-rows para colapsar a 0). Una vez abierta y asentada, se
  // libera a `overflow-visible` para que paneles flotantes internos (CustomSelect) puedan
  // desbordar hacia la sección siguiente en vez de quedar recortados.
  const [settledOpen, setSettledOpen] = useState(isOpen)
  const showOverflow = isOpen && settledOpen

  return (
    <div className={`rounded-2xl border border-neutral-200 bg-white shadow-card ${showOverflow ? '' : 'overflow-hidden'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 rounded-t-2xl px-4 py-4 text-left transition-colors hover:bg-neutral-50"
      >
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
            isComplete
              ? 'bg-success-600 text-white'
              : isOpen
                ? 'bg-primary-600 text-white'
                : 'bg-neutral-100 text-neutral-500'
          }`}
        >
          {isComplete ? <Check size={14} /> : step}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{title}</p>
          {!isOpen && summary ? <p className="truncate text-xs text-neutral-500">{summary}</p> : null}
        </div>
        <ChevronDown size={18} className={`shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        onTransitionEnd={() => setSettledOpen(isOpen)}
      >
        <div className={showOverflow ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="flex flex-col gap-4 border-t border-neutral-100 px-4 py-4">{children}</div>
        </div>
      </div>
    </div>
  )
}
