import { createFileRoute, redirect } from '@tanstack/react-router'
import { rutaPostAuth } from '../lib/auth'

// "/" no tiene contenido propio — entra directo al login, o a donde corresponda si ya hay sesión
// (cambio de contraseña obligatorio, selector de módulo, o el panel del rol).
export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    if (context.auth?.perfil.activo && context.auth.perfil.roles.length > 0) {
      throw redirect({ to: rutaPostAuth(context.auth.perfil) })
    }
    throw redirect({ to: '/login' })
  },
})
