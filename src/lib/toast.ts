import { sileo } from 'sileo'

// Wrapper delgado sobre `sileo` — nombres en español (mismo criterio que el resto del data
// layer: `abrirTurno`, `registrarSalida`, etc.) y un solo lugar para el patrón que ya se repite
// en cada formulario del repo:
//
//   catch (err) { setError(err instanceof Error ? err.message : 'No se pudo …') }
//
// `toast.desdeError` hace ese mismo rescate y lo manda como toast, para no reescribirlo en cada
// componente. No reemplaza el `<p className="text-danger-600">{error}</p>` inline que ya usan los
// modales — el toast es la confirmación efímera de "algo pasó"; el texto inline sigue siendo la
// explicación que se queda en pantalla mientras el formulario sigue abierto.
export const toast = {
  exito: (mensaje: string) => sileo.success({ title: mensaje }),
  error: (mensaje: string) => sileo.error({ title: mensaje }),
  info: (mensaje: string) => sileo.info({ title: mensaje }),
  advertencia: (mensaje: string) => sileo.warning({ title: mensaje }),
  desdeError: (err: unknown, fallback: string) =>
    sileo.error({ title: err instanceof Error ? err.message : fallback }),
}
