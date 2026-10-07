import { useAjustesNegocio } from '../../lib/useAjustesNegocio'
import logoIsotipo from '../../assets/logo-isotipo.png'

// Encabezado y pie de los tiquetes de 58 mm: salen de Configuración › Datos del negocio, ya no
// están escritos en cada tiquete. Marcado plano (sin Tailwind) como el resto de tiquete-print.css.

function lineaDeContacto(direccion?: string, telefono?: string): string | undefined {
  const partes = [direccion, telefono ? `Tel. ${telefono}` : undefined].filter(Boolean)
  return partes.length > 0 ? partes.join(' · ') : undefined
}

/** Logo + actividad + (dirección · teléfono) + "NIT … · título del comprobante". */
export function EncabezadoTiquete({ titulo }: { titulo: string }) {
  const negocio = useAjustesNegocio()
  const contacto = lineaDeContacto(negocio.direccion, negocio.telefono)
  return (
    <>
      <img src={logoIsotipo} alt="" className="tiquete-58__logo" />
      {negocio.actividad ? <p className="tiquete-58__tagline">{negocio.actividad}</p> : null}
      {contacto ? <p className="tiquete-58__tagline">{contacto}</p> : null}
      <p className="tiquete-58__nit-titulo">
        {negocio.nit ? `NIT ${negocio.nit} · ` : ''}
        {titulo}
      </p>
    </>
  )
}

/** Nombre + actividad: la versión de las colillas de liquidación (que llevan el nombre en texto). */
export function MarcaTiquete() {
  const negocio = useAjustesNegocio()
  const contacto = lineaDeContacto(negocio.direccion, negocio.telefono)
  return (
    <>
      <p className="tiquete-58__marca">{negocio.nombre}</p>
      {negocio.actividad ? <p className="tiquete-58__tagline">{negocio.actividad}</p> : null}
      {contacto ? <p className="tiquete-58__tagline">{contacto}</p> : null}
    </>
  )
}

/** Mensaje de cierre + aviso de factura electrónica (solo si hay correo configurado). */
export function PieTiquete() {
  const negocio = useAjustesNegocio()
  return (
    <>
      {negocio.mensajePie ? <p className="tiquete-58__pie">{negocio.mensajePie}</p> : null}
      {negocio.correoFactura ? (
        <p className="tiquete-58__pie-legal">Factura electrónica: solicítala a {negocio.correoFactura}</p>
      ) : null}
    </>
  )
}
