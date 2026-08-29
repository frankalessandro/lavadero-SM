import { z } from 'zod'

// 'datafono' = pago con tarjeta en el POS físico del datáfono — distinto de 'transferencia'
// (Nequi/Bancolombia app a app) aunque los dos requieren referencia y ninguno es efectivo físico
// para el arqueo (ver calcularValorEsperado en src/data/turnos.ts). Cuánto de lo cobrado por
// datáfono llega neto a la cuenta (descuento de la pasarela) es una configuración pendiente,
// todavía no modelada — por ahora se registra el monto bruto cobrado, igual que transferencia.
// Métodos de pago reales (los que puede tener una LÍNEA de pago). Se usan en el reparto de un
// cobro partido (src/schemas/pago.ts), en parqueadero y en la venta de un solo producto.
export const metodoPagoBaseSchema = z.enum(['efectivo', 'transferencia', 'datafono'])
// Etiqueta-resumen guardada en `ordenes.metodo_pago` / `ventas.metodo_pago`: el método real
// cuando el cobro tuvo uno solo, o 'mixto' cuando se repartió en varios. El detalle por método
// (para arqueo/dashboards) sale de la tabla `pagos`, nunca de esta columna.
export const metodoPagoSchema = z.enum(['efectivo', 'transferencia', 'datafono', 'mixto'])
export const estadoOrdenSchema = z.enum(['en_proceso', 'listo', 'entregado', 'anulada'])

// Postgres devuelve `null` (no `undefined`) en las columnas nullable sin valor —
// `.nullish()` + transform normaliza ambos a `undefined` para el resto de la app.
const nullableTrimmedString = z
  .string()
  .trim()
  .nullish()
  .transform((value) => value ?? undefined)

// Placa colombiana: carro = 3 letras + 3 números (ej. MAQ068), moto = 3 letras + 2 números + 1
// letra (ej. ZCD24D) — mismo patrón para ambas categorías porque acá no se sabe todavía si el
// tipo elegido es auto o moto (se valida antes de eso). Sin espacios/guiones/símbolos.
export const placaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{3}(?:[0-9]{3}|[0-9]{2}[A-Z])$/,
    'Placa inválida — carro: 3 letras y 3 números (ej. MAQ068), moto: 3 letras, 2 números y 1 letra (ej. ZCD24D)',
  )

const nullableTimestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

const nullableSegundos = z
  .number()
  .int()
  .nonnegative()
  .nullish()
  .transform((value) => value ?? undefined)

// Servicio individual de la orden — sea porque no lleva combo, o porque se agregó suelto
// encima de uno (ej. "Combo 2 + lavado de motor extra"). Precio snapshot al crear la orden,
// igual criterio de inmutabilidad que `precio`/`comisionLavador`.
export const ordenServicioAdicionalSchema = z.object({
  servicioId: z.string(),
  nombre: z.string(),
  precio: z.number().int().nonnegative(),
})

export const ordenSchema = z.object({
  id: z.string(),
  consecutivo: z.number().int().positive(),
  placa: z.string().trim().min(1),
  clienteNombre: z.string().trim().min(1),
  clienteTelefono: nullableTrimmedString,
  clienteCorreo: nullableTrimmedString,
  tipoVehiculoId: z.string(),
  // Ya no es obligatorio: una orden puede ser solo servicios individuales, sin combo.
  comboId: nullableTrimmedString,
  // Puede quedar sin asignar al registrar (todos los lavadores ocupados, cliente hace cola) —
  // se asigna después desde el tablero de seguimiento con la misma acción de reasignar.
  lavadorId: nullableTrimmedString,
  // Segundo lavador — "lavar entre 2" (a criterio de recepción/jefe de zona, caso a caso). Cuando
  // está presente, la comisión total (`comisionLavador`) se reparte 50/50 entre lavadorId y
  // lavadorId2 (ver comisionParaLavador en src/data/liquidaciones.ts) — comisionLavador acá sigue
  // siendo el TOTAL de la orden, no la mitad de nadie.
  lavadorId2: nullableTrimmedString,
  precio: z.number().int().positive(),
  // Recargo fijo de moto alto cilindraje ya sumado a `precio` — se guarda aparte solo para poder
  // mostrarlo/auditarlo, no se resta ni se recalcula desde acá.
  altoCilindraje: z.boolean(),
  comisionLavador: z.number().int().nonnegative(),
  // Jefe de patio en turno al registrar el vehículo (comisión nueva, sobre el 100% igual que la
  // del lavador) — comisionNegocio ya no es "el resto del lavador", es el resto de los dos.
  comisionJefeZona: z.number().int().nonnegative(),
  jefeZonaResponsable: nullableTrimmedString,
  comisionNegocio: z.number().int().nonnegative(),
  // Se conoce recién al cobrar/entregar, no al registrar el vehículo.
  metodoPago: metodoPagoSchema.nullish().transform((value) => value ?? undefined),
  referenciaPago: nullableTrimmedString,
  observaciones: nullableTrimmedString,
  // Marca manual de "ya le avisamos que está listo" — puro control operativo del jefe de zona,
  // no afecta cobro/entrega ni ninguna regla de negocio.
  notificadoListo: z.boolean(),
  estado: estadoOrdenSchema,
  creadoEn: z.string(),
  listaEn: nullableTimestamp,
  entregadaEn: nullableTimestamp,
  // KPIs de M3/M10: duración fijada al momento de cada transición, no recalculada después.
  tiempoLavadoSegundos: nullableSegundos,
  tiempoEsperaEntregaSegundos: nullableSegundos,
  liquidacionId: nullableTimestamp,
  // Liquidación del segundo lavador — independiente de `liquidacionId` (del principal): cada
  // mitad de la comisión se puede liquidar en un momento distinto (ver src/data/liquidaciones.ts).
  liquidacionId2: nullableTimestamp,
  // Liquidación de la comisión del jefe de patio — tabla/flujo aparte de liquidaciones de
  // lavadores (ver src/data/liquidacionesJefeZona.ts), independiente por completo de
  // liquidacionId/liquidacionId2.
  liquidacionJefeZonaId: nullableTimestamp,
  motivoAnulacion: nullableTrimmedString,
  anuladaEn: nullableTimestamp,
  anuladaPor: nullableTrimmedString,
  serviciosAdicionales: ordenServicioAdicionalSchema.array().default([]),
})

export const anularOrdenInputSchema = z.object({
  motivo: z.string().trim().min(3, 'El motivo de anulación es obligatorio'),
  anuladaPor: z.string().trim().min(1, 'Indica quién anula la orden'),
})

// Registro del vehículo — sin datos de pago, eso llega en el cobro (M2 real: se cobra al
// entregar, no al recibir el vehículo). El combo ya no es obligatorio: la orden puede ser solo
// servicios individuales (regla `.refine` abajo exige al menos uno de los dos).
export const ordenInputSchema = z
  .object({
    placa: placaSchema,
    clienteNombre: z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
    clienteTelefono: z.string().trim().optional(),
    clienteCorreo: z.string().trim().email('Correo inválido').optional(),
    tipoVehiculoId: z.string().min(1, 'Selecciona el tipo de vehículo'),
    comboId: z.string().trim().min(1).optional(),
    // Opcional: si todos los lavadores están ocupados y hay cola, se puede registrar el
    // vehículo sin asignar todavía y hacerlo después desde el tablero de seguimiento.
    lavadorId: z.string().trim().min(1).optional(),
    // "Lavar entre 2" — a criterio de quien recibe, caso a caso. Opcional, y solo tiene sentido
    // con lavadorId ya elegido (validado abajo).
    lavadorId2: z.string().trim().min(1).optional(),
    // Solo aplica a motos — recepción muestra el checkbox únicamente cuando el tipo elegido es
    // de categoría moto, pero el default acá evita que quede undefined si no se toca el campo.
    altoCilindraje: z.boolean().optional().default(false),
    observaciones: z.string().trim().optional(),
    // Servicios individuales — sea que acompañen al combo o que sean todo lo que lleva la orden.
    serviciosAdicionales: z.array(z.string()).optional().default([]),
  })
  .refine((data) => !!data.comboId || data.serviciosAdicionales.length > 0, {
    message: 'Selecciona un combo o al menos un servicio individual',
    path: ['comboId'],
  })
  .refine((data) => !data.lavadorId2 || !!data.lavadorId, {
    message: 'Elige primero el lavador principal antes del segundo',
    path: ['lavadorId2'],
  })
  .refine((data) => !data.lavadorId2 || data.lavadorId2 !== data.lavadorId, {
    message: 'El segundo lavador debe ser distinto al principal',
    path: ['lavadorId2'],
  })

// Edición de datos de contacto del cliente mientras el vehículo sigue en_proceso o listo (antes
// de cobrar/entregar) — combo/tipo/lavador no se tocan aquí, esos definen el servicio ya
// registrado. La placa sí es editable acá porque es un dato de captura en recepción que se
// puede haber tomado mal (typo, confusión con otro vehículo) y hay que poder corregirlo antes
// de cobrar/entregar.
export const clienteInfoInputSchema = z.object({
  placa: placaSchema,
  clienteNombre: z.string().trim().min(1, 'El nombre del cliente es obligatorio'),
  clienteTelefono: z.string().trim().optional(),
  clienteCorreo: z.string().trim().email('Correo inválido').optional(),
})

// El cobro + entrega (M3) ya no lleva un método suelto: el reparto de pago vive en
// src/schemas/pago.ts (`cobroPagosInputSchema`) y se persiste en la tabla `pagos`.

export type OrdenServicioAdicional = z.infer<typeof ordenServicioAdicionalSchema>
export type Orden = z.infer<typeof ordenSchema>
export type OrdenInput = z.infer<typeof ordenInputSchema>
export type ClienteInfoInput = z.infer<typeof clienteInfoInputSchema>
export type AnularOrdenInput = z.infer<typeof anularOrdenInputSchema>
// Incluye 'mixto' — es el tipo de la columna-resumen. Para una línea de pago real usa
// `MetodoPagoBase`.
export type MetodoPago = z.infer<typeof metodoPagoSchema>
export type MetodoPagoBase = z.infer<typeof metodoPagoBaseSchema>
export type EstadoOrden = z.infer<typeof estadoOrdenSchema>
