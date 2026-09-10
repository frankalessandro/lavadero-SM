import { useEffect, useState } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sileo'
import { resolveAuthContext, subscribeAuthChanges, type AuthContext } from './lib/auth'
import { useIdleLogout } from './lib/idleTimer'

type AppRouter = Parameters<typeof RouterProvider>[0]['router']

export function App({ router }: { router: AppRouter }) {
  const [auth, setAuth] = useState<AuthContext | null | undefined>(undefined)

  useEffect(() => {
    resolveAuthContext().then(setAuth)

    const unsubscribe = subscribeAuthChanges(() => {
      resolveAuthContext().then((next) => {
        setAuth(next)
        router.invalidate()
      })
    })

    return unsubscribe
  }, [router])

  useIdleLogout(!!auth)

  if (auth === undefined) return <div className="route-status">Cargando…</div>

  return (
    <>
      {/* `theme="light"` a propósito: el panel es intencionalmente light-only (ver CLAUDE.md,
          "Trampa de cascade layers") — dejar `theme="system"` repetiría el mismo bug de texto
          invisible en modo oscuro del SO que ya se corrigió una vez para el resto de la UI.
          `top-center` (arriba y centrado): admin/jefe-zona tienen `MobileTabBar` fija abajo en
          celular, así que un toast abajo quedaría tapado o tapándolo. */}
      <Toaster position="top-center" theme="light" />
      <RouterProvider router={router} context={{ auth }} />
    </>
  )
}
