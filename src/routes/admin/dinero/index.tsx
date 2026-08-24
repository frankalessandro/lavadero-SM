import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/dinero/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/dinero/liquidaciones' })
  },
})
