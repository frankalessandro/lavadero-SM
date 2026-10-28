import { ChevronRight, Mail, MessageCircle, Phone, UserRound } from 'lucide-react'
import { whatsappHref } from '../../lib/whatsapp'
import { Modal } from './Modal'

// Modal de contacto reutilizable — usado en la tarjeta de seguimiento de jefe de zona para
// avisar por WhatsApp/llamada que el vehículo está listo, sin salir del dashboard. WhatsApp es la
// acción principal (lleva el mensaje armado), llamar y correo quedan como opciones de apoyo.
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
  const opcion =
    'flex min-h-12 items-center gap-3 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm transition-colors hover:border-neutral-300 hover:bg-neutral-50'
  return (
    <Modal title={nombre} subtitle={<span className="font-mono">{placa}</span>} icon={UserRound} size="sm" onClose={onClose}>
      {telefono || correo ? (
        <div className="flex flex-col gap-2">
          {telefono ? (
            <>
              <a
                href={whatsappHref(telefono, mensajeWhatsapp)}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-14 items-center gap-3 rounded-xl bg-success-600 px-4 py-3 text-white shadow-card transition-colors hover:bg-success-700"
              >
                <MessageCircle size={20} className="shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">Escribir por WhatsApp</span>
                  <span className="truncate text-xs text-white/80">Con el mensaje ya escrito</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-white/70" />
              </a>
              <a href={`tel:${telefono.replace(/\s+/g, '')}`} className={opcion}>
                <Phone size={16} className="shrink-0 text-primary-600" />
                <span className="flex-1 font-medium text-neutral-800">Llamar</span>
                <span className="font-mono text-xs text-neutral-500">{telefono}</span>
              </a>
            </>
          ) : null}
          {correo ? (
            <a href={`mailto:${correo}`} className={opcion}>
              <Mail size={16} className="shrink-0 text-neutral-500" />
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{correo}</span>
            </a>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500">
          Sin teléfono ni correo registrados. Agrégalos con «Editar cliente».
        </p>
      )}
    </Modal>
  )
}
