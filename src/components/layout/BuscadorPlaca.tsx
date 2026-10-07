import { useState, type FormEvent } from 'react'
import { useRouteContext } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { PlacaPerfilModal } from './PlacaPerfilModal'
import { Modal } from './Modal'
import { Button } from './Button'

const LARGO_MIN = 3

function normalizar(texto: string): string {
  return texto.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

// Buscador de placa del Topbar, junto al perfil: busca esa placa en todo el sistema (lavados,
// parqueadero y suscripción, según lo que el rol pueda ver) y abre su perfil en un modal. Desde
// una pantalla angosta es un botón con lupa que abre un cuadro de búsqueda.
export function BuscadorPlaca() {
  const rol = useRouteContext({
    from: '__root__',
    select: (c) => c.auth?.perfil.rolActivo ?? c.auth?.perfil.roles[0],
  })
  const [texto, setTexto] = useState('')
  const [placaAbierta, setPlacaAbierta] = useState<string | null>(null)
  const [buscandoEnCelular, setBuscandoEnCelular] = useState(false)

  if (!rol) return null
  const valida = texto.length >= LARGO_MIN

  function ejecutarBusqueda() {
    if (!valida) return
    setPlacaAbierta(texto)
    setTexto('')
    setBuscandoEnCelular(false)
  }

  function buscar(e: FormEvent) {
    e.preventDefault()
    ejecutarBusqueda()
  }

  return (
    <>
      <form onSubmit={buscar} role="search" className="relative hidden sm:block">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={texto}
          onChange={(e) => setTexto(normalizar(e.target.value))}
          placeholder="Buscar placa"
          aria-label="Buscar una placa en todo el sistema"
          maxLength={6}
          className="w-36 rounded-xl border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 font-mono text-sm uppercase outline-none transition-all placeholder:font-sans placeholder:normal-case placeholder:text-neutral-400 focus:w-48 focus:border-primary-500 focus:bg-white focus:ring-1 focus:ring-primary-500"
        />
      </form>

      <button
        type="button"
        onClick={() => setBuscandoEnCelular(true)}
        aria-label="Buscar placa"
        className="flex size-9 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 sm:hidden"
      >
        <Search size={19} />
      </button>

      {buscandoEnCelular ? (
        <Modal
          title="Buscar placa"
          subtitle="Lavados, parqueadero y suscripción de ese vehículo"
          icon={Search}
          size="sm"
          onClose={() => setBuscandoEnCelular(false)}
          footer={
            <Button variant="primary" disabled={!valida} onClick={ejecutarBusqueda}>
              Buscar
            </Button>
          }
        >
          <form onSubmit={buscar}>
            <input
              autoFocus
              value={texto}
              onChange={(e) => setTexto(normalizar(e.target.value))}
              placeholder="ABC123"
              maxLength={6}
              aria-label="Placa"
              className="w-full rounded-lg border border-neutral-300 px-3 py-3 text-center font-mono text-xl uppercase tracking-widest outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            />
          </form>
        </Modal>
      ) : null}

      {placaAbierta ? <PlacaPerfilModal placa={placaAbierta} rol={rol} onClose={() => setPlacaAbierta(null)} /> : null}
    </>
  )
}
