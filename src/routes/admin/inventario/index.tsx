import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/inventario/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/inventario/stock' })
  },
})
