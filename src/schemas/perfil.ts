import { z } from 'zod'

export const rolSchema = z.enum(['admin', 'jefe_zona', 'vigilante'])

export const ROL_LABEL: Record<Rol, string> = {
  admin: 'Administrador',
  jefe_zona: 'Jefe de zona',
  vigilante: 'Vigilante',
}

export const perfilSchema = z.object({
  id: z.string(),
  nombre: z.string().trim().nullable(),
  // 0 a 3 roles. Sin roles = cuenta creada pero todavía sin asignar (no puede entrar).
  roles: rolSchema.array(),
  // Módulo activo elegido tras login — es lo que la RLS lee (interno.rol_actual()). null hasta
  // que se elige; se limpia en signOut.
  rolActivo: rolSchema.nullable(),
  activo: z.boolean(),
  debeCambiarPassword: z.boolean(),
  // Enlace a la persona real del roster (personal_operativo). Puede ser null en cuentas viejas.
  personaId: z.string().nullable(),
  creadoEn: z.string(),
})

export const perfilInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  roles: rolSchema.array().min(1, 'Asigna al menos un rol'),
  activo: z.boolean(),
  personaId: z.string().trim().optional(),
})

// Crear la cuenta completa desde /admin/personal/usuarios — solo funciona contra Supabase real
// (requiere Auth + Edge Function, ver src/data/perfiles.ts:createUsuario). El correo y la
// contraseña desechable se derivan/generan en createUsuario, no se piden acá.
export const crearUsuarioInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  apellido: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
  roles: rolSchema.array().min(1, 'Asigna al menos un rol'),
  personaId: z.string().trim().optional(),
})

export type Rol = z.infer<typeof rolSchema>
export type Perfil = z.infer<typeof perfilSchema>
export type PerfilInput = z.infer<typeof perfilInputSchema>
export type CrearUsuarioInput = z.infer<typeof crearUsuarioInputSchema>
