// Contraseña desechable para el alta y el reseteo de cuentas — se muestra una vez al admin y la
// persona la cambia obligatoriamente en su primer ingreso (perfiles.debe_cambiar_password).
// Formato pensado para dictarse por teléfono sin errores: prefijo fijo `sm-` + una tira
// consonante-vocal pronunciable (p. ej. "sm-kotibe"). Sin caracteres ambiguos ni dígitos.
const CONSONANTES = 'bcdfghjkmnpqrstvwxyz'
const VOCALES = 'aeiou'

export function generarPasswordDesechable(silabas = 3): string {
  const buffer = new Uint32Array(silabas * 2)
  crypto.getRandomValues(buffer)
  let cuerpo = ''
  for (let i = 0; i < silabas; i += 1) {
    cuerpo += CONSONANTES[buffer[i * 2] % CONSONANTES.length]
    cuerpo += VOCALES[buffer[i * 2 + 1] % VOCALES.length]
  }
  return `sm-${cuerpo}`
}

// nombre + apellido -> "nombreapellido", sin tildes, minúsculas, solo alfanumérico. Es lo que
// forma el usuario `<esto>@carwashsm.com` (el dominio no recibe correo, es solo identificador).
export function normalizaParaEmail(...partes: string[]): string {
  return partes
    .join('')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
