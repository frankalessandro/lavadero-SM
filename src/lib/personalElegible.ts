import { useEffect, useState } from 'react'
import { fetchPerfilesElegibles } from '../data/perfiles'
import type { Perfil } from '../schemas/perfil'
import type { RolCaja } from '../schemas/turnoCaja'

// Hook + helper compartidos por TurnoResponsableBanner y los wizards de apertura/cierre de turno
// — en `lib/` y no en el componente por `react-refresh/only-export-components` (mismo motivo que
// `src/lib/pagoLineas.ts`/`src/lib/kpi.ts`).

// Cuentas que pueden quedar a cargo de esta caja: las activas que tengan ese rol (ver 0056 — desde
// que el roster desapareció, la cuenta ES la persona y el rol de la cuenta es el permiso).
export function usePersonalElegible(rol: RolCaja) {
  const [elegibles, setElegibles] = useState<Perfil[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    fetchPerfilesElegibles(rol)
      .then((lista) => {
        if (vivo) setElegibles(lista)
      })
      .catch(() => {
        if (vivo) setElegibles([])
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [rol])

  return { elegibles, cargando }
}

// `perfiles.nombre` es nullable en el esquema (la fila la crea un trigger de Auth antes de que un
// admin le ponga nombre). En un selector eso no puede quedar en blanco.
export function nombreDe(perfil: Perfil) {
  return perfil.nombre?.trim() || 'Sin nombre'
}
