// Supabase corta cada consulta en 1.000 filas. Cualquier lectura por rango de fechas que alimente
// una cifra (rentabilidad, acumulado del año, reportes) tiene que paginar: un total que se calla
// la mitad de las filas es peor que uno que falla, porque nadie se entera.
//
// El orden de cada consulta debe terminar en `id` para que dos filas con el mismo timestamp no se
// salten ni se repitan entre páginas.

export const TAM_PAGINA = 1000

type Respuesta = { data: unknown[] | null; error: { message: string } | null }

export async function paginar<T>(pedir: (desde: number, hasta: number) => PromiseLike<Respuesta>): Promise<T[]> {
  const todas: T[] = []
  for (let desde = 0; ; desde += TAM_PAGINA) {
    const { data, error } = await pedir(desde, desde + TAM_PAGINA - 1)
    if (error) throw new Error(error.message)
    const pagina = (data ?? []) as T[]
    todas.push(...pagina)
    if (pagina.length < TAM_PAGINA) return todas
  }
}
