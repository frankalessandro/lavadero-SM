import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter } from '@tanstack/react-router'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import './index.css'
import './styles/tiquete-print.css'
import { routeTree } from './routeTree.gen'
import { App } from './App'
import { queryClient } from './lib/queryClient'
import { CargandoContenido } from './components/layout/PantallaCarga'
import { ErrorPantalla } from './components/layout/ErrorPantalla'

const router = createRouter({
  routeTree,
  context: { auth: null },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  // Sin esto una pantalla con loader lento dejaba el contenido en blanco: el router no mostraba nada
  // hasta pasar 1 s. Con 200 ms el spinner aparece enseguida y `PendingMinMs` evita el parpadeo
  // cuando la carga es casi instantánea.
  defaultPendingComponent: CargandoContenido,
  defaultPendingMs: 200,
  defaultPendingMinMs: 400,
  defaultErrorComponent: ErrorPantalla,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
