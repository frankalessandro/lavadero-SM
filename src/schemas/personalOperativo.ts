import { z } from 'zod'

// Nivel jerárquico de la persona, NO el rol de la caja que abre — Frank y Laura son
// administradores aunque cubran el mostrador como jefes de patio. Es lo que decide (Capa 2) si
// una operación excepcional necesita revisión posterior: la de un administrador no, porque él
// mismo es quien revisa.
export const nivelPersonalSchema = z.enum(['administrador', 'jefe_patio', 'vigilante'])

export const personalOperativoSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  nivel: nivelPersonalSchema,
  telefono: z
    .string()
    .trim()
    .nullish()
    .transform((value) => value ?? undefined),
  activo: z.boolean(),
  creadoEn: z.string(),
})

export const personalOperativoInputSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres'),
  nivel: nivelPersonalSchema,
  telefono: z.string().trim().optional(),
})

export type NivelPersonal = z.infer<typeof nivelPersonalSchema>
export type PersonalOperativo = z.infer<typeof personalOperativoSchema>
export type PersonalOperativoInput = z.infer<typeof personalOperativoInputSchema>

export const NIVEL_LABEL: Record<NivelPersonal, string> = {
  administrador: 'Administrador',
  jefe_patio: 'Jefe de patio',
  vigilante: 'Vigilante',
}

// Quién puede quedar como responsable de cada caja. Los administradores cubren cualquiera de las
// dos (es lo que pasa hoy: Frank abre la caja de jefe de zona constantemente); el jefe de patio
// no abre la del vigilante ni al revés.
export const NIVELES_POR_CAJA: Record<'jefe_zona' | 'vigilante', NivelPersonal[]> = {
  jefe_zona: ['administrador', 'jefe_patio'],
  vigilante: ['administrador', 'vigilante'],
}
