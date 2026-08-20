import { Mail, MessageCircle, Phone, User, X } from 'lucide-react'

// Colombia: celulares son 10 dígitos sin indicativo — wa.me exige el indicativo del país.
// Si el número ya trae otro largo (fijo con indicativo, etc.) se manda tal cual, sin adivinar más.
function whatsappHref(telefono: string, mensaje: string): string {
  const digitos = telefono.replace(/\D/g, '')
  const conIndicativo = digitos.length === 10 ? `57${digitos}` : digitos
  return `https://wa.me/${conIndicativo}?text=${encodeURIComponent(mensaje)}`
}

// Modal de contacto reutilizable — usado en la tarjeta de seguimiento de jefe de zona para
// avisar por WhatsApp/llamada que el vehículo está listo, sin salir del dashboard.
export function ContactoModal({
  nombre,
  placa,
  telefono,
  correo,
  mensajeWhatsapp,
  onClose,
}: {
  nombre: string
  placa: string
  telefono?: string
  correo?: string
  mensajeWhatsapp: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-neutral-900/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-card-hover">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
              <User size={17} />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-neutral-900">{nombre}</h3>
              <p className="font-mono text-xs text-neutral-500">{placa}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100"
          >
            <X size={18} />
          </button>
        </div>

        {telefono || correo ? (
          <div className="flex flex-col gap-2">
            {telefono ? (
              <>
                <a
                  href={whatsappHref(telefono, mensajeWhatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-lg bg-success-50 px-3 py-2.5 text-sm font-semibold text-success-700 transition-colors hover:bg-success-100"
                >
                  <MessageCircle size={16} />
                  WhatsApp · {telefono}
                </a>
                <a
                  href={`tel:${telefono.replace(/\s+/g, '')}`}
                  className="flex items-center gap-2.5 rounded-lg bg-primary-50 px-3 py-2.5 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
                >
                  <Phone size={16} />
                  Llamar · {telefono}
                </a>
              </>
            ) : null}
            {correo ? (
              <a
                href={`mailto:${correo}`}
                className="flex items-center gap-2.5 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
              >
                <Mail size={16} />
                {correo}
              </a>
            ) : null}
          </div>
        ) : (
          <p className="rounded-lg bg-neutral-50 px-3 py-3 text-center text-sm text-neutral-500">
            Sin datos de contacto registrados para este cliente.
          </p>
        )}
      </div>
    </div>
  )
}
