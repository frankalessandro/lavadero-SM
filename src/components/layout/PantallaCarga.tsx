import { Loader2 } from 'lucide-react'

// Estado de carga único del sistema. Antes cada caso mostraba un "Cargando…" de texto suelto (o
// nada: mientras un loader pendiente no pasaba el umbral del router, la pantalla quedaba en blanco
// al abrir la app, cambiar de sesión o entrar a una pantalla pesada).

/** Pantalla completa — arranque de la app, resolución de la sesión y cambios de panel. */
export function PantallaCarga({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-neutral-50 text-neutral-500"
    >
      <Loader2 size={30} className="animate-spin text-primary-600" />
      <p className="text-sm font-medium">{mensaje}</p>
    </div>
  )
}

/** Dentro del área de contenido — el Sidebar y el Topbar siguen visibles mientras carga una pantalla. */
export function CargandoContenido({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-24 text-neutral-500">
      <Loader2 size={26} className="animate-spin text-primary-600" />
      <p className="text-sm font-medium">{mensaje}</p>
    </div>
  )
}
