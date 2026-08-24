import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/personal/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/personal/lavadores' })
  },
})
