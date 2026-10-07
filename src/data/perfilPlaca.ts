import { fetchOrdenesPorPlaca } from './ordenes'
import { fetchEstanciasPorPlaca, fetchLavadoHoyPorPlaca, type LavadoHoy } from './estanciasParqueadero'
import { fetchSuscripcionesPorPlaca } from './suscripcionesParqueadero'
import { fetchCombos } from './combos'
import { fetchTiposVehiculo } from './tiposVehiculo'
import { fetchLavadores } from './lavadores'
import type { Orden } from '../schemas/orden'
import type { EstanciaParqueadero } from '../schemas/estanciaParqueadero'
import type { SuscripcionParqueadero } from '../schemas/suscripcionParqueadero'
import type { Rol } from '../lib/roles'

export interface PerfilPlaca {
  placa: string
  /** null = este rol no ve los lavados (RLS: el vigilante no tiene acceso a `ordenes`). */
  ordenes: Orden[] | null
  /** null = este rol no ve el parqueadero (RLS: el jefe de patio no tiene acceso a `estancias`). */
  estancias: EstanciaParqueadero[] | null
  suscripciones: SuscripcionParqueadero[]
  /** Solo para el vigilante, que no lee `ordenes` pero sí necesita saber si hoy pasó por el lavado. */
  lavadoHoy?: LavadoHoy
  combos: Map<string, string>
  tipos: Map<string, string>
  lavadores: Map<string, string>
}

// Todo lo que el sistema sabe de una placa, limitado a lo que el rol puede leer: la restricción
// real la hace RLS en la base; acá solo se evita pedir (y mostrar como "vacío") lo que de todos
// modos devolvería 0 filas.
export async function fetchPerfilPlaca(placa: string, rol: Rol): Promise<PerfilPlaca> {
  const verOrdenes = rol === 'admin' || rol === 'jefe_zona'
  const verEstancias = rol === 'admin' || rol === 'vigilante'

  const [ordenes, estancias, suscripciones, lavadoHoy, combos, tipos, lavadores] = await Promise.all([
    verOrdenes ? fetchOrdenesPorPlaca(placa) : Promise.resolve(null),
    verEstancias ? fetchEstanciasPorPlaca(placa) : Promise.resolve(null),
    fetchSuscripcionesPorPlaca(placa),
    rol === 'vigilante' ? fetchLavadoHoyPorPlaca(placa) : Promise.resolve(undefined),
    verOrdenes ? fetchCombos() : Promise.resolve([]),
    verOrdenes ? fetchTiposVehiculo() : Promise.resolve([]),
    verOrdenes ? fetchLavadores() : Promise.resolve([]),
  ])

  return {
    placa: placa.trim().toUpperCase(),
    ordenes,
    estancias,
    suscripciones,
    lavadoHoy,
    combos: new Map(combos.map((c) => [c.id, c.nombre])),
    tipos: new Map(tipos.map((t) => [t.id, t.nombre])),
    lavadores: new Map(lavadores.map((l) => [l.id, l.nombre])),
  }
}
