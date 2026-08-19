import { useEffect } from 'react'
import { signOut } from './auth'

const TIMEOUT_MS = 12 * 60 * 60 * 1000 // 12 h — regla antifraude: cierre de sesión automático por inactividad (ajustado por Alessandro, confirmado explícitamente).
const EVENTS = ['mousemove', 'keydown', 'click', 'touchstart'] as const

// Se monta una sola vez en App (main.tsx), activo solo mientras hay sesión — cubre los 3 roles
// uniformemente en vez de duplicar el timer por layout.
export function useIdleLogout(active: boolean) {
  useEffect(() => {
    if (!active) return

    let timer = window.setTimeout(signOut, TIMEOUT_MS)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(signOut, TIMEOUT_MS)
    }

    EVENTS.forEach((event) => window.addEventListener(event, reset))
    return () => {
      window.clearTimeout(timer)
      EVENTS.forEach((event) => window.removeEventListener(event, reset))
    }
  }, [active])
}
