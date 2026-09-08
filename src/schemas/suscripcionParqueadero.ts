import { z } from 'zod'

// Solo mensualidad y fijo: "noche" se cobra por movimiento y no lleva suscripción.
export const modalidadSuscripcionSchema = z.enum(['mensualidad', 'fijo'])

const nullableString = z
  .string()
  .nullish()
  .transform((v) => v ?? undefined)

export const suscripcionParqueaderoSchema = z.object({
  id: z.string(),
  placa: z.string(),
  titular: z.string(),
  telefono: nullableString,
  modalidad: modalidadSuscripcionSchema,
  valor: z.number().int().nonnegative(),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  activo: z.boolean(),
  nota: nullableString,
  creadoPor: nullableString,
  creadoEn: z.string(),
})

export const suscripcionInputSchema = z
  .object({
    placa: z.string().trim().min(1, 'La placa es obligatoria').toUpperCase(),
    titular: z.string().trim().min(2, 'El titular es obligatorio'),
    telefono: z.string().trim().optional(),
    modalidad: modalidadSuscripcionSchema,
    valor: z.number().int().nonnegative(),
    fechaInicio: z.string().min(1, 'La fecha de inicio es obligatoria'),
    fechaFin: z.string().min(1, 'La fecha de vencimiento es obligatoria'),
    nota: z.string().trim().optional(),
  })
  .refine((v) => v.fechaFin >= v.fechaInicio, {
    message: 'La fecha de vencimiento no puede ser anterior a la de inicio',
    path: ['fechaFin'],
  })

export type ModalidadSuscripcion = z.infer<typeof modalidadSuscripcionSchema>
export type SuscripcionParqueadero = z.infer<typeof suscripcionParqueaderoSchema>
export type SuscripcionInput = z.infer<typeof suscripcionInputSchema>

export type EstadoVigencia = 'vigente' | 'por_vencer' | 'vencida'

// Umbral de "por vencer": 7 días. Igual criterio para el badge del listado de admin y el aviso
// de la portería del vigilante.
export function estadoVigencia(fechaFin: string, hoy = new Date()): EstadoVigencia {
  const fin = new Date(`${fechaFin}T23:59:59`)
  const dias = (fin.getTime() - hoy.getTime()) / 86_400_000
  if (dias < 0) return 'vencida'
  if (dias <= 7) return 'por_vencer'
  return 'vigente'
}

export const ESTADO_VIGENCIA_LABEL: Record<EstadoVigencia, string> = {
  vigente: 'Al día',
  por_vencer: 'Por vencer',
  vencida: 'Vencida',
}
