import { z } from 'zod'

const nullableString = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined)

// Acciones que emiten los triggers de 0044_bitacora_auditoria.sql. Se valida como string suelto
// (no enum) a propósito: agregar un trigger nuevo en una migración no debe romper la lectura de
// esta pantalla; `ACCION_LABEL` cae al valor crudo si aparece una acción que el cliente no conoce.
export const bitacoraEntradaSchema = z.object({
  id: z.number().int(),
  ocurridoEn: z.string(),
  usuarioId: nullableString,
  usuarioNombre: nullableString,
  usuarioRol: nullableString,
  personaId: nullableString,
  personaNombre: nullableString,
  entidad: z.string(),
  entidadId: nullableString,
  accion: z.string(),
  antes: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? undefined),
  despues: z.record(z.string(), z.unknown()).nullish().transform((v) => v ?? undefined),
})

export type BitacoraEntrada = z.infer<typeof bitacoraEntradaSchema>

export const ACCION_LABEL: Record<string, string> = {
  crear: 'Creación',
  anular: 'Anulación',
  editar: 'Edición',
  cambiar_precio: 'Cambio de precio',
  ajustar_inventario: 'Movimiento de inventario',
  cambiar_configuracion: 'Cambio de configuración',
}

export const ENTIDAD_LABEL: Record<string, string> = {
  ordenes: 'Orden de lavado',
  ventas: 'Venta de producto',
  cuentas: 'Cuenta abierta',
  estancias_parqueadero: 'Parqueadero',
  turnos_caja: 'Turno de caja',
  movimientos_inventario: 'Inventario',
  productos: 'Producto',
  precios_servicios_combo: 'Precio de combo',
  precios_servicios_individual: 'Precio individual',
  precios_combo_fijo: 'Precio de combo fijo',
  tarifas_parqueadero: 'Tarifa de parqueadero',
  configuracion: 'Configuración',
}

// Las cuatro acciones que el Plan nombra como no negociables, más la edición del histórico que
// era el hueco de `editarInfoCliente`. Es el filtro rápido de la pantalla.
export const ACCIONES_FILTRO = [
  'crear',
  'anular',
  'editar',
  'cambiar_precio',
  'ajustar_inventario',
  'cambiar_configuracion',
] as const
