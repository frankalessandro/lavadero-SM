import { createFileRoute, redirect } from '@tanstack/react-router'

// La sección no tiene pantalla propia — abre su primera pestaña. Igual criterio en Dinero,
// Catálogo y Personal: el ítem del menú lateral apunta a la sección, no a una ruta hija concreta,
// para que el destino siga siendo válido si mañana cambia el orden de las pestañas.
export const Route = createFileRoute('/admin/operacion/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/operacion/ordenes' })
  },
})
