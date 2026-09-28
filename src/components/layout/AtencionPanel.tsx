import { Link } from '@tanstack/react-router'
import { AlertOctagon, AlertTriangle, Info, CheckCircle2, ChevronRight } from 'lucide-react'
import type { Alerta, SeveridadAlerta } from '../../data/alertas'

const ESTILO: Record<SeveridadAlerta, { icono: typeof Info; chip: string; barra: string; boton: string }> = {
  alta: {
    icono: AlertOctagon,
    chip: 'bg-danger-50 text-danger-600',
    barra: 'bg-danger-600',
    boton: 'bg-danger-600 text-white hover:bg-danger-700',
  },
  media: {
    icono: AlertTriangle,
    chip: 'bg-warning-50 text-warning-600',
    barra: 'bg-warning-600',
    boton: 'border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50',
  },
  info: {
    icono: Info,
    chip: 'bg-primary-50 text-primary-600',
    barra: 'bg-primary-400',
    boton: 'text-primary-700 hover:bg-primary-50',
  },
}

// Bandeja de "qué necesita una decisión de gerencia" — las mismas alertas de la campana del
// Topbar (src/data/alertas.ts), pero a la vista y con acción directa, primero en el dashboard.
export function AtencionPanel({ alertas }: { alertas: Alerta[] }) {
  if (alertas.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success-600/20 bg-success-50 px-4 py-3.5">
        <CheckCircle2 size={20} className="shrink-0 text-success-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-success-700">Todo en orden</p>
          <p className="text-xs text-success-700/80">No hay pagos, faltantes ni diferencias de caja esperando una decisión.</p>
        </div>
      </div>
    )
  }

  const altas = alertas.filter((a) => a.severidad === 'alta').length
  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-neutral-900">Requiere tu atención</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              altas > 0 ? 'bg-danger-600 text-white' : 'bg-neutral-100 text-neutral-600'
            }`}
          >
            {alertas.length}
          </span>
        </div>
        {altas > 0 ? (
          <span className="text-xs font-medium text-danger-600">
            {altas} urgente{altas === 1 ? '' : 's'}
          </span>
        ) : null}
      </header>
      <ul className="divide-y divide-neutral-100">
        {alertas.map((a) => {
          const e = ESTILO[a.severidad]
          const Icono = e.icono
          return (
            <li key={a.id} className="relative">
              <span className={`absolute inset-y-0 left-0 w-1 ${e.barra}`} />
              <Link
                to={a.ruta}
                className="flex items-center gap-3 py-3 pr-3 pl-4 transition-colors hover:bg-neutral-50 sm:pr-5 sm:pl-5"
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${e.chip}`}>
                  <Icono size={17} strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-neutral-900">{a.titulo}</span>
                  <span className="block truncate text-xs text-neutral-500">{a.detalle}</span>
                </span>
                <span
                  className={`hidden shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:inline-flex ${e.boton}`}
                >
                  {a.accion}
                  <ChevronRight size={13} />
                </span>
                <ChevronRight size={16} className="shrink-0 text-neutral-300 sm:hidden" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
