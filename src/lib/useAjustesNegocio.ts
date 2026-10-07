import { useQuery } from '@tanstack/react-query'
import { fetchAjustesNegocio } from '../data/ajustesNegocio'
import { AJUSTES_NEGOCIO_POR_DEFECTO, type AjustesNegocio } from '../schemas/ajustesNegocio'
import { queryKeys } from './queryKeys'

export const ajustesNegocioQuery = {
  queryKey: queryKeys.ajustesNegocio,
  queryFn: fetchAjustesNegocio,
  // Casi nunca cambia: los tiquetes no necesitan pedirlo en cada apertura.
  staleTime: 10 * 60_000,
}

// Datos del negocio para los tiquetes. Mientras carga (o si la consulta falla) devuelve los valores
// de siempre, así un tiquete nunca sale vacío ni con un nombre en blanco.
export function useAjustesNegocio(): AjustesNegocio {
  const { data } = useQuery(ajustesNegocioQuery)
  return data ?? AJUSTES_NEGOCIO_POR_DEFECTO
}
