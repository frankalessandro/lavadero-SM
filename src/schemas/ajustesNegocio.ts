import { z } from 'zod'

const textoOpcional = z
  .string()
  .nullish()
  .transform((v) => v?.trim() || undefined)

// Datos que salen impresos en los tiquetes y reglas de la cola de rotación (0086). Una sola fila,
// editable por gerencia; todos los roles operativos la leen.
export const rotacionCriterioSchema = z.enum(['ultima_asignacion', 'menos_vehiculos'])
export const rotacionOcupadoSchema = z.enum(['saltar', 'permitir'])

export const ajustesNegocioSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre del negocio es obligatorio'),
  actividad: z.string().trim().default(''),
  nit: textoOpcional,
  direccion: textoOpcional,
  telefono: textoOpcional,
  correoFactura: textoOpcional,
  mensajePie: z.string().trim().default(''),
  rotacionCriterio: rotacionCriterioSchema,
  rotacionOcupado: rotacionOcupadoSchema,
})

export type AjustesNegocio = z.infer<typeof ajustesNegocioSchema>

// Lo que rige si todavía no cargaron los ajustes (primer pintado): igual a lo que antes estaba
// escrito en los tiquetes, así nada cambia de golpe.
export const AJUSTES_NEGOCIO_POR_DEFECTO: AjustesNegocio = {
  nombre: 'Carwash SM',
  actividad: 'Lavadero · Parqueadero',
  nit: '1113661734-4',
  direccion: undefined,
  telefono: undefined,
  correoFactura: 'gerencia@carwashsm.com',
  mensajePie: 'Gracias por su visita',
  rotacionCriterio: 'ultima_asignacion',
  rotacionOcupado: 'saltar',
}

export const ROTACION_CRITERIO_LABEL: Record<z.infer<typeof rotacionCriterioSchema>, { titulo: string; detalle: string }> = {
  ultima_asignacion: {
    titulo: 'Quien lleva más tiempo sin vehículo',
    detalle: 'Rota por turnos: el siguiente es el que más hace que no recibe uno hoy. Desempata la hora de llegada.',
  },
  menos_vehiculos: {
    titulo: 'Quien lleva menos vehículos hoy',
    detalle: 'Equilibra por cantidad atendida en el día (no por ingresos). Desempata la hora de llegada.',
  },
}

export const ROTACION_OCUPADO_LABEL: Record<z.infer<typeof rotacionOcupadoSchema>, { titulo: string; detalle: string }> = {
  saltar: {
    titulo: 'Saltarlo y conservar su lugar',
    detalle: 'Si ya tiene un vehículo en proceso, la cola avanza al siguiente y él conserva su posición.',
  },
  permitir: {
    titulo: 'No saltarlo',
    detalle: 'Sigue en la cola aunque esté ocupado (algunos lavan dos a la vez).',
  },
}
