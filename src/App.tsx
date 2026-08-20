import { useEffect, useState } from 'react'
import { RouterProvider } from '@tanstack/react-router'
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

  return <RouterProvider router={router} context={{ auth }} />
}
