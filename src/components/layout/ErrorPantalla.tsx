import { useRouter } from '@tanstack/react-router'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from './Button'

// Error de una pantalla (un loader que falló, una consulta rechazada por RLS, red caída…). Va como
// `defaultErrorComponent` del router: el error se muestra dentro del área de contenido, con el menú
// a la vista, y se puede reintentar sin recargar toda la página.
export function ErrorPantalla({ error, reset }: { error: Error; reset?: () => void }) {
  const router = useRouter()
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-50 text-danger-600">
        <AlertTriangle size={22} />
      </span>
      <div>
        <h2 className="text-base font-semibold text-neutral-900">No se pudo cargar esta pantalla</h2>
        <p className="mt-1 break-words text-sm text-neutral-500">{error.message}</p>
      </div>
      <Button
        icon={RotateCw}
        onClick={() => {
          reset?.()
          router.invalidate()
        }}
      >
        Reintentar
      </Button>
    </div>
  )
}
