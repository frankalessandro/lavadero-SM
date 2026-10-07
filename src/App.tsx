import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Toaster } from 'sileo'
import { resolveAuthContext, subscribeAuthChanges, type AuthContext } from './lib/auth'
import { useIdleLogout } from './lib/idleTimer'
import { PantallaCarga } from './components/layout/PantallaCarga'
import { ajustesNegocioQuery } from './lib/useAjustesNegocio'

type AppRouter = Parameters<typeof RouterProvider>[0]['router']

// Qué define "otra sesión" para el router: quién es y qué puede hacer. El token se renueva cada
// hora y Supabase vuelve a emitir eventos al volver a la pestaña; con la misma persona y los
// mismos permisos no hay nada que recargar.
function firmaDeSesion(auth: AuthContext | null): string {
  if (!auth) return 'sin-sesion'
  const p = auth.perfil
  return [p.id, p.rolActivo ?? '', p.roles.join(','), p.activo, p.debeCambiarPassword].join('|')
}

export function App({ router }: { router: AppRouter }) {
  const [auth, setAuth] = useState<AuthContext | null | undefined>(undefined)
  const firmaRef = useRef<string | undefined>(undefined)
  const queryClient = useQueryClient()

  useEffect(() => {
    resolveAuthContext().then(async (inicial) => {
      firmaRef.current = firmaDeSesion(inicial)
      // La primera pantalla se resuelve (guards, redirecciones y loaders) con el loader de pantalla
      // completa todavía visible. Antes se montaba el router de inmediato y el usuario veía, uno tras
      // otro, el loader, el menú del sitio, un spinner interno y recién ahí el contenido.
      router.update({ context: { auth: inicial } })
      try {
        await router.load()
      } catch {
        // Un error del loader lo muestra la pantalla de error del router, no este arranque.
      }
      setAuth(inicial)
    })

    const unsubscribe = subscribeAuthChanges(() => {
      resolveAuthContext().then((next) => {
        setAuth(next)
        // Solo se recargan las pantallas si cambió la persona o sus permisos (login, logout, cambio
        // de módulo). Un refresco de token o volver a la pestaña no debe re-ejecutar todos los
        // loaders: era lo que dejaba la pantalla en blanco unos segundos.
        const firma = firmaDeSesion(next)
        if (firma === firmaRef.current) return
        firmaRef.current = firma
        router.invalidate()
      })
    })

    return unsubscribe
  }, [router])

  // Los tiquetes leen el nombre, NIT y mensaje del negocio de la caché: se piden al iniciar sesión
  // para que el primero que se imprima ya los tenga.
  const haySesion = !!auth
  useEffect(() => {
    if (haySesion) queryClient.prefetchQuery(ajustesNegocioQuery)
  }, [haySesion, queryClient])

  useIdleLogout(!!auth)

  if (auth === undefined) return <PantallaCarga mensaje="Iniciando sesión…" />

  return (
    <>
      {/* `theme="light"` a propósito: el panel es intencionalmente light-only (ver CLAUDE.md,
          "Trampa de cascade layers") — dejar `theme="system"` repetiría el mismo bug de texto
          invisible en modo oscuro del SO que ya se corrigió una vez para el resto de la UI.
          `top-center` (arriba y centrado): el hamburguesa del Topbar abre el menú desde arriba,
          y un toast abajo compite peor con el pulgar en celular. */}
      <Toaster position="top-center" theme="light" />
      <RouterProvider router={router} context={{ auth }} />
    </>
  )
}
