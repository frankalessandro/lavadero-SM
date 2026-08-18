import { createFileRoute, redirect } from '@tanstack/react-router'
import { ROL_HOME } from '../lib/auth'

// "/" no tiene contenido propio — entra directo al login, o al panel de su rol si ya hay sesión.
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.auth?.perfil.rol && context.auth.perfil.activo) {
      throw redirect({ to: ROL_HOME[context.auth.perfil.rol] })
    }
    throw redirect({ to: '/login' })
  },
})
