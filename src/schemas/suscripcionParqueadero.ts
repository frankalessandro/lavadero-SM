import { z } from 'zod'
import { claseVehiculoParqueaderoSchema } from './estanciaParqueadero'
import { metodoPagoBaseSchema } from './orden'
import { fechaLocalISO } from '../lib/periodo'

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
  claseVehiculo: claseVehiculoParqueaderoSchema,
  valor: z.number().int().nonnegative(),
  fechaInicio: z.string(),
  fechaFin: z.string(),
  activo: z.boolean(),
  nota: nullableString,
  creadoPor: nullableString,
  creadoEn: z.string(),
})

// El valor NO se envía: lo fija la base desde `tarifas_parqueadero` (clase × condición). La fecha de
// inicio solo la respeta la base si quien registra es gerencia; para los demás es hoy.
export const crearSuscripcionInputSchema = z.object({
  placa: z.string().trim().min(5, 'La placa es obligatoria').toUpperCase(),
  titular: z.string().trim().min(2, 'El nombre del titular es obligatorio'),
  telefono: z.string().trim().optional(),
  claseVehiculo: claseVehiculoParqueaderoSchema,
  modalidad: modalidadSuscripcionSchema,
  fechaInicio: z.string().min(1, 'La fecha de inicio es obligatoria'),
  metodoPago: metodoPagoBaseSchema,
  nota: z.string().trim().optional(),
})

// Datos del titular: no toca vigencia, valor, clase ni condición (esos cambian renovando o creando
// una suscripción nueva).
export const actualizarSuscripcionInputSchema = z.object({
  placa: z.string().trim().min(5, 'La placa es obligatoria').toUpperCase(),
  titular: z.string().trim().min(2, 'El nombre del titular es obligatorio'),
  telefono: z.string().trim().optional(),
  nota: z.string().trim().optional(),
})

export type ModalidadSuscripcion = z.infer<typeof modalidadSuscripcionSchema>
export type SuscripcionParqueadero = z.infer<typeof suscripcionParqueaderoSchema>
export type CrearSuscripcionInput = z.infer<typeof crearSuscripcionInputSchema>
export type ActualizarSuscripcionInput = z.infer<typeof actualizarSuscripcionInputSchema>

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

// Un pago por periodo (append-only): la suscripción guarda solo el periodo vigente, esto es el
// historial de cada mes pagado.
export const pagoSuscripcionSchema = z.object({
  id: z.string(),
  suscripcionId: z.string(),
  monto: z.number().int().nonnegative(),
  // null en los pagos de la carga inicial, anteriores a que se registrara el método.
  metodoPago: metodoPagoBaseSchema.nullish().transform((v) => v ?? undefined),
  fechaPago: z.string(),
  periodoInicio: z.string(),
  periodoFin: z.string(),
  registradoPor: nullableString,
  creadoEn: z.string(),
})
export type PagoSuscripcion = z.infer<typeof pagoSuscripcionSchema>

// Días de calendario que faltan para el vencimiento (negativo = ya venció). Compara fechas, no
// horas, así "vence hoy" es 0 sin importar la hora del día.
export function diasParaVencer(fechaFin: string, hoy = new Date()): number {
  const fin = new Date(`${fechaFin}T00:00:00`)
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((fin.getTime() - inicioHoy.getTime()) / 86_400_000)
}

export function textoVencimiento(dias: number): string {
  if (dias === 0) return 'Vence hoy'
  if (dias === 1) return 'Vence mañana'
  if (dias > 1) return `Vence en ${dias} días`
  if (dias === -1) return 'Venció ayer'
  return `Venció hace ${-dias} días`
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long' })

// Mensaje de WhatsApp para avisar del vencimiento (o de que ya venció) y ofrecer la renovación.
export function construirMensajeSuscripcion(sus: SuscripcionParqueadero, hoy = new Date()): string {
  const dias = diasParaVencer(sus.fechaFin, hoy)
  const fecha = FECHA_LARGA.format(new Date(`${sus.fechaFin}T00:00:00`))
  const plan = sus.modalidad === 'fijo' ? 'plan fijo 24h' : 'mensualidad'
  const saludo = sus.titular === TITULAR_SIN_REGISTRAR ? 'Hola' : `Hola ${sus.titular}`
  const estado =
    dias > 1
      ? `vence el ${fecha} (en ${dias} días)`
      : dias === 1
        ? `vence mañana, ${fecha}`
        : dias === 0
          ? 'vence hoy'
          : `venció el ${fecha} (${dias === -1 ? 'ayer' : `hace ${-dias} días`})`
  return `${saludo}, te escribimos de CarWash SM ✨. Tu ${plan} de parqueadero del vehículo ${sus.placa} ${estado}. Para renovarla son ${sus.valor.toLocaleString('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })}. ¡Gracias!`
}

// Titular de las suscripciones cargadas sin nombre — no se le habla por ese "nombre".
export const TITULAR_SIN_REGISTRAR = 'Sin registrar'

// Un mes después, igual que `interval '1 month'` de Postgres: 31 ene + 1 mes = 28/29 feb.
export function sumarUnMes(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const destino = new Date(y, m, 1) // día 1 del mes siguiente
  const ultimoDia = new Date(destino.getFullYear(), destino.getMonth() + 1, 0).getDate()
  destino.setDate(Math.min(d, ultimoDia))
  return fechaLocalISO(destino)
}

// Periodo que cubriría un pago hecho en `fechaPago` (misma regla que la RPC de renovar): si sigue
// vigente el mes nuevo arranca donde termina el actual; si ya venció, el día del pago. Es solo la
// vista previa — el periodo real lo fija la base.
export function periodoDeRenovacion(
  sus: Pick<SuscripcionParqueadero, 'activo' | 'fechaFin'>,
  fechaPago: string,
): { inicio: string; fin: string } {
  const inicio = sus.activo && sus.fechaFin >= fechaPago ? sus.fechaFin : fechaPago
  return { inicio, fin: sumarUnMes(inicio) }
}

export const CONDICION_LABEL: Record<ModalidadSuscripcion, { titulo: string; detalle: string }> = {
  mensualidad: { titulo: 'Mensualidad', detalle: 'Entra y sale de 7pm a 7am' },
  fijo: { titulo: 'Fijo 24h', detalle: 'Entra y sale cuando quiera' },
}
