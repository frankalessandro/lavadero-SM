import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { fetchAlertas, type Alerta } from '../../data/alertas'
import { toast } from '../../lib/toast'

// Campana junto al avatar del Topbar de admin — antes ese comentario decía "no hay notificaciones
// reales en el sistema todavía". Ahora sí: agrega en un solo panel señales que ya existían cada
// una en su propia pantalla (stock bajo, huecos de consecutivo, faltantes de conteo, suscripciones
// de parqueadero por vencer, correcciones de reparto de pago) — sin tabla nueva, es una relectura.
export function NotificacionesCentro() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    setCargando(true)
    try {
      setAlertas(await fetchAlertas())
    } catch (err) {
      toast.desdeError(err, 'No se pudieron cargar las notificaciones')
    } finally {
      setCargando(false)
    }
  }

  // Al montar el panel de admin, una sola vez — no es una pantalla operativa de tiempo real
  // (como el polling de 12s de ventas pendientes en jefe-zona), es un vistazo de "qué necesita
  // atención hoy" que se refresca al abrir el panel. `cargando` ya arranca en `true`, así que acá
  // no hace falta (ni conviene, react-hooks/set-state-in-effect) volver a ponerlo — solo la carga
  // inicial en sí, mismo patrón que `usePersonalElegible` en TurnoResponsableBanner.
  useEffect(() => {
    let vivo = true
    fetchAlertas()
      .then((data) => {
        if (vivo) setAlertas(data)
      })
      .catch((err) => {
        if (vivo) toast.desdeError(err, 'No se pudieron cargar las notificaciones')
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          const next = !abierto
          setAbierto(next)
          if (next) void cargar()
        }}
        title="Notificaciones"
        className="flex size-9 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
      >
        <span className="relative">
          <Bell size={18} />
          {alertas.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-danger-600 text-[10px] font-semibold text-white">
              {alertas.length > 9 ? '9+' : alertas.length}
            </span>
          ) : null}
        </span>
      </button>

      {abierto ? (
        <>
          {/* Backdrop de pantalla completa para cerrar al tocar afuera — mismo patrón que
              CustomSelect, no un listener de `document` aparte. */}
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-neutral-100 bg-white p-2 shadow-card-hover">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-sm font-semibold text-neutral-900">Notificaciones</p>
              {alertas.length > 0 ? <p className="text-xs text-neutral-400">{alertas.length}</p> : null}
            </div>
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {cargando ? (
                <p className="px-2 py-4 text-center text-xs text-neutral-400">Cargando…</p>
              ) : alertas.length === 0 ? (
                <p className="px-2 py-4 text-center text-xs text-neutral-400">Nada que revisar por ahora.</p>
              ) : (
                alertas.map((a) => (
                  <Link
                    key={a.id}
                    to={a.ruta}
                    onClick={() => setAbierto(false)}
                    className="flex flex-col gap-0.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-primary-50/60"
                  >
                    <span className="text-sm font-medium text-neutral-900">{a.titulo}</span>
                    <span className="truncate text-xs text-neutral-500">{a.detalle}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
