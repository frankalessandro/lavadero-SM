// Colombia: celulares son 10 dígitos sin indicativo — wa.me exige el indicativo del país.
// Si el número ya trae otro largo (fijo con indicativo, etc.) se manda tal cual, sin adivinar más.
export function whatsappHref(telefono: string, mensaje: string): string {
  const digitos = telefono.replace(/\D/g, '')
  const conIndicativo = digitos.length === 10 ? `57${digitos}` : digitos
  return `https://wa.me/${conIndicativo}?text=${encodeURIComponent(mensaje)}`
}
