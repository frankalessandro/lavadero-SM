import type { Rol } from '../schemas/perfil'

// Simulación del "módulo activo" en modo local (VITE_USE_LOCAL_DB=true, sin Auth real). Con más
// de un rol en VITE_LOCAL_ROLES, /seleccionar-modulo necesita guardar en algún lado cuál se
// eligió — si no, el hard-nav a /admin, /jefe-zona o /vigilante recarga la página,
// resolveAuthContext() vuelve a resolver el contexto sin memoria de la elección, y exigirRol()
// manda de regreso al selector: un loop infinito, no se puede entrar a ningún módulo que no sea
// el único con un solo rol. sessionStorage (no localStorage) porque es un dato de esta pestaña de
// desarrollo, no algo que deba sobrevivir a cerrar el navegador — mismo criterio que "sesión
// individual, sin cuentas compartidas" del resto del sistema, aplicado a esta simulación.
const KEY = 'lavadero_local_rol_activo'

export function leerRolActivoLocal(): Rol | null {
  try {
    return (sessionStorage.getItem(KEY) as Rol | null) ?? null
  } catch {
    return null
  }
}

export function guardarRolActivoLocal(rol: Rol | null): void {
  try {
    if (rol) sessionStorage.setItem(KEY, rol)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Sin storage disponible (ej. modo privado estricto) — no hay nada más que hacer, el selector
    // simplemente reaparecerá en la próxima navegación.
  }
}
