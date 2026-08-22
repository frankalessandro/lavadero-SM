import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter } from '@tanstack/react-router'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
// Solo para los dos títulos de marca (Topbar "Lavadero"/"Panel de administración" y Sidebar
// "Carwash SM", vía la utilidad .font-display de index.css) — un peso único, el resto de la UI
// sigue en Plus Jakarta Sans.
import '@fontsource/outfit/700.css'
import './index.css'
import './styles/tiquete-print.css'
import { routeTree } from './routeTree.gen'
import { App } from './App'

const router = createRouter({
  routeTree,
  context: { auth: null },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
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
    <App router={router} />
  </StrictMode>,
)
