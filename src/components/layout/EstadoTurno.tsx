import type { ReactNode } from 'react'
import { Lock, LockOpen } from 'lucide-react'

// Franja de estado de la caja del turno — la misma en parqueadero, caja del jefe de patio y
// seguimiento: verde con responsable si está abierta, ámbar si no. Va arriba de todo lo demás
// porque sin turno abierto no se puede registrar movimientos.
export function EstadoTurno({
  abierto,
  titulo,
  detalle,
  accion,
}: {
  abierto: boolean
  titulo: string
  detalle?: ReactNode
  accion?: ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        abierto ? 'border-success-600/25 bg-success-50' : 'border-warning-600/25 bg-warning-50'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
            abierto ? 'bg-success-600/10 text-success-700' : 'bg-warning-600/10 text-warning-700'
          }`}
        >
          {abierto ? <LockOpen size={18} strokeWidth={2.25} /> : <Lock size={18} strokeWidth={2.25} />}
        </span>
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${abierto ? 'text-success-700' : 'text-warning-700'}`}>{titulo}</p>
          {detalle ? <p className="text-xs text-neutral-600">{detalle}</p> : null}
        </div>
      </div>
      {accion ? <div className="flex shrink-0 flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">{accion}</div> : null}
    </div>
  )
}
