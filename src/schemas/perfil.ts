import { z } from 'zod'

export const rolSchema = z.enum(['admin', 'jefe_zona', 'vigilante'])

export const perfilSchema = z.object({
  id: z.string(),
  nombre: z.string().trim().nullable(),
  rol: rolSchema.nullable(),
  activo: z.boolean(),
  creadoEn: z.string(),
})

export const perfilInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  rol: rolSchema,
  activo: z.boolean(),
})

export type Rol = z.infer<typeof rolSchema>
export type Perfil = z.infer<typeof perfilSchema>
export type PerfilInput = z.infer<typeof perfilInputSchema>
