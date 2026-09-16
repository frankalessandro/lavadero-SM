import { z } from 'zod'

export const configuracionSchema = z.object({
  comisionLavadorPorcentaje: z.number().min(0).max(1),
  // Comisión del jefe de patio en turno, por tramo de combo (confirmado con Alessandro
  // 2026-09-16, reemplaza el % único que regía desde 0028): Combo 1 de cada categoría (el lavado
  // básico) paga un % más bajo, Combo 2 en adelante uno más alto — el combo se identifica por
  // `combos.nombre = 'Combo 1'`, no por una columna nueva (ver 0071). El negocio se lleva lo que
  // quede (100% - lavador% - jefeZona%), no un porcentaje fijo aparte.
  comisionJefeZonaCombo1Porcentaje: z.number().min(0).max(1),
  comisionJefeZonaCombo2Porcentaje: z.number().min(0).max(1),
  // Servicios sueltos (sin combo, o agregados encima de uno) — hoy en 0%, sin decisión de negocio
  // todavía sobre pagarle jefe de patio por esto.
  comisionJefeZonaServiciosPorcentaje: z.number().min(0).max(1),
  comisionBase: z.enum(['lista', 'cobrado']),
  periodicidadLiquidacion: z.enum(['diaria', 'semanal']),
  // Recargo fijo para motos de alto cilindraje (checkbox en recepción) — se suma al precio del
  // combo/servicios antes de repartir comisión, igual que cualquier otro monto del total.
  recargoAltoCilindraje: z.number().int().nonnegative(),
})

export type Configuracion = z.infer<typeof configuracionSchema>
