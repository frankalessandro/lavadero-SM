import { db } from '../lib/db'
import { ajustesNegocioSchema, type AjustesNegocio } from '../schemas/ajustesNegocio'

const SELECT =
  'nombre:negocio_nombre, actividad:negocio_actividad, nit:negocio_nit, direccion:negocio_direccion, telefono:negocio_telefono, correoFactura:negocio_correo_factura, mensajePie:tiquete_mensaje_pie, rotacionCriterio:rotacion_criterio, rotacionOcupado:rotacion_ocupado'

export async function fetchAjustesNegocio(): Promise<AjustesNegocio> {
  const { data, error } = await db.from('ajustes_negocio').select(SELECT).single()
  if (error) throw new Error(error.message)
  return ajustesNegocioSchema.parse(data)
}

// Solo gerencia (RLS). Se guarda tal cual: vacío = sin dato (null), no se imprime.
export async function updateAjustesNegocio(input: AjustesNegocio): Promise<AjustesNegocio> {
  const p = ajustesNegocioSchema.parse(input)
  const { data, error } = await db
    .from('ajustes_negocio')
    .update({
      negocio_nombre: p.nombre,
      negocio_actividad: p.actividad,
      negocio_nit: p.nit ?? null,
      negocio_direccion: p.direccion ?? null,
      negocio_telefono: p.telefono ?? null,
      negocio_correo_factura: p.correoFactura ?? null,
      tiquete_mensaje_pie: p.mensajePie,
      rotacion_criterio: p.rotacionCriterio,
      rotacion_ocupado: p.rotacionOcupado,
    })
    .eq('id', true)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return ajustesNegocioSchema.parse(data)
}
