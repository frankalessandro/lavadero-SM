import { z } from 'zod'
import { rolSchema } from '../lib/roles'

// La lista de roles y sus etiquetas viven en un solo lugar (src/lib/roles.ts). Se re-exportan
// acá por compatibilidad con los imports existentes desde '../schemas/perfil'.
export { rolSchema, ROL_LABEL, ROLES, type Rol, type RolInfo } from '../lib/roles'

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
  creadoEn: z.string(),
})

export const perfilInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  roles: rolSchema.array().min(1, 'Asigna al menos un rol'),
  activo: z.boolean(),
})

// Crear la cuenta completa desde /admin/personal/usuarios — solo funciona contra Supabase real
// (requiere Auth + Edge Function, ver src/data/perfiles.ts:createUsuario). El correo y la
// contraseña desechable se derivan/generan en createUsuario, no se piden acá.
export const crearUsuarioInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  apellido: z.string().trim().min(2, 'El apellido debe tener al menos 2 caracteres'),
  roles: rolSchema.array().min(1, 'Asigna al menos un rol'),
})

export type Perfil = z.infer<typeof perfilSchema>
export type PerfilInput = z.infer<typeof perfilInputSchema>
export type CrearUsuarioInput = z.infer<typeof crearUsuarioInputSchema>
