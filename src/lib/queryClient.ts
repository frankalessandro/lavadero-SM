import { QueryClient } from '@tanstack/react-query'

// Cliente único, compartido por toda la app (ver main.tsx). `staleTime` de 10s: en un POS no hace
// falta refrescar en cada re-render, pero tampoco queremos servir un dato de hace 10 minutos —
// 10s es corto para el usuario y suficiente para no repetir la misma consulta si dos componentes
// piden lo mismo casi al mismo tiempo. `refetchOnWindowFocus: false` porque el patrón real de uso
// es una tablet dejada abierta todo el turno: volver de otra app no debe disparar un refetch
// sorpresa que reordene la pantalla mientras alguien está a mitad de un formulario.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})
