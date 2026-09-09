// Contraseña desechable para el alta y el reseteo de cuentas — se muestra una vez al admin y la
// persona la cambia obligatoriamente en su primer ingreso (perfiles.debe_cambiar_password).
// Sin caracteres ambiguos (0/O, 1/l/I) para que se pueda dictar sin errores.
const ALFABETO = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generarPasswordDesechable(largo = 12): string {
  const buffer = new Uint32Array(largo)
  crypto.getRandomValues(buffer)
  let salida = ''
  for (let i = 0; i < largo; i += 1) {
    salida += ALFABETO[buffer[i] % ALFABETO.length]
  }
  return salida
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
