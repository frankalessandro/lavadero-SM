import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/catalogo/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/catalogo/combos' })
  },
})
