import { db } from '../lib/db'

// No hay tabla `clientes` — el registro de contacto vive por orden (M2, ya existente).
// Esta vista agrega `ordenes` por placa para obtener un "expediente" de cliente: quién es,
// cómo contactarlo, qué vehículo trae y cuándo fue la última vez, sin duplicar datos.
export interface ClienteResumen {
  placa: string
  clienteNombre: string
  clienteTelefono?: string
  clienteCorreo?: string
  tipoVehiculoId: string
  ultimoComboId: string
  ultimoServicioEn: string
  totalServicios: number
}

interface OrdenClienteRow {
  placa: string
  clienteNombre: string
  clienteTelefono: string | null
  clienteCorreo: string | null
  tipoVehiculoId: string
  comboId: string
  creadoEn: string
}

// Excluye anuladas (regla 13: quedan visibles en auditoría, pero no representan un servicio
// real prestado) — orden por `creado_en` desc para que el primer registro de cada placa sea
// el más reciente y sirva de representante del cliente.
export async function fetchClientes(): Promise<ClienteResumen[]> {
  const { data, error } = await db
    .from('ordenes')
    .select(
      'placa, clienteNombre:cliente_nombre, clienteTelefono:cliente_telefono, clienteCorreo:cliente_correo, tipoVehiculoId:tipo_vehiculo_id, comboId:combo_id, creadoEn:creado_en',
    )
    .neq('estado', 'anulada')
    .order('creado_en', { ascending: false })
  if (error) throw new Error(error.message)

  const filas = data as unknown as OrdenClienteRow[]
  const porPlaca = new Map<string, ClienteResumen>()
  for (const fila of filas) {
    const existente = porPlaca.get(fila.placa)
    if (existente) {
      existente.totalServicios += 1
      continue
    }
    porPlaca.set(fila.placa, {
      placa: fila.placa,
      clienteNombre: fila.clienteNombre,
      clienteTelefono: fila.clienteTelefono ?? undefined,
      clienteCorreo: fila.clienteCorreo ?? undefined,
      tipoVehiculoId: fila.tipoVehiculoId,
      ultimoComboId: fila.comboId,
      ultimoServicioEn: fila.creadoEn,
      totalServicios: 1,
    })
  }
  return Array.from(porPlaca.values())
}
