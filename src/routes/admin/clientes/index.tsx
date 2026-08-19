import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Mail, MessageCircle, Phone, Search } from 'lucide-react'
import { fetchClientes, type ClienteResumen } from '../../../data/clientes'
import { fetchTiposVehiculo } from '../../../data/tiposVehiculo'
import { fetchCombos } from '../../../data/combos'
import { Card } from '../../../components/layout/Card'
import { StatCard } from '../../../components/layout/StatCard'

// Mismo criterio de indicativo que src/components/layout/ContactoModal.tsx.
function whatsappHref(telefono: string, mensaje: string): string {
  const digitos = telefono.replace(/\D/g, '')
  const conIndicativo = digitos.length === 10 ? `57${digitos}` : digitos
  return `https://wa.me/${conIndicativo}?text=${encodeURIComponent(mensaje)}`
}

async function loadClientesPage() {
  const [clientes, tiposVehiculo, combos] = await Promise.all([
    fetchClientes(),
    fetchTiposVehiculo(),
    fetchCombos(),
  ])
  return { clientes, tiposVehiculo, combos }
}

export const Route = createFileRoute('/admin/clientes/')({
  loader: loadClientesPage,
  component: ClientesPage,
})

function ClientesPage() {
  const { clientes, tiposVehiculo, combos } = Route.useLoaderData()
  const [busqueda, setBusqueda] = useState('')

  const tipoNombrePorId = new Map(tiposVehiculo.map((t) => [t.id, t.nombre]))
  const comboNombrePorId = new Map(combos.map((c) => [c.id, c.nombre]))

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase()
    const base: ClienteResumen[] = !termino
      ? clientes
      : clientes.filter(
          (c) => c.placa.toLowerCase().includes(termino) || c.clienteNombre.toLowerCase().includes(termino),
        )
    return [...base].sort((a, b) => new Date(b.ultimoServicioEn).getTime() - new Date(a.ultimoServicioEn).getTime())
  }, [clientes, busqueda])

  const conTelefono = clientes.filter((c) => c.clienteTelefono).length

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Clientes</h2>
        <p className="text-sm text-neutral-500">
          Base de clientes construida a partir del histórico de órdenes (M2) — un registro por placa.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Clientes registrados" value={String(clientes.length)} icon={Search} />
        <StatCard label="Con teléfono" value={String(conTelefono)} icon={Phone} />
        <StatCard label="Con correo" value={String(clientes.filter((c) => c.clienteCorreo).length)} icon={Mail} />
      </div>

      <label className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2.5 text-sm focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 sm:max-w-xs">
        <Search size={16} className="shrink-0 text-neutral-400" />
        <input
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Buscar por placa o nombre…"
          className="w-full outline-none"
        />
      </label>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
                <th className="px-5 py-3">Cliente</th>
                <th className="px-5 py-3">Contacto</th>
                <th className="px-5 py-3">Vehículo</th>
                <th className="px-5 py-3">Placa</th>
                <th className="px-5 py-3">Último servicio</th>
                <th className="px-5 py-3">Servicios</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((cliente) => (
                <tr
                  key={cliente.placa}
                  className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40"
                >
                  <td className="px-5 py-3 font-medium text-neutral-900">{cliente.clienteNombre}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      {cliente.clienteTelefono ? (
                        <>
                          <a
                            href={whatsappHref(
                              cliente.clienteTelefono,
                              `Hola ${cliente.clienteNombre}, te contactamos desde el lavadero sobre tu vehículo ${cliente.placa}.`,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            title={`WhatsApp · ${cliente.clienteTelefono}`}
                            className="flex size-8 items-center justify-center rounded-lg text-success-600 transition-colors hover:bg-success-50"
                          >
                            <MessageCircle size={15} />
                          </a>
                          <a
                            href={`tel:${cliente.clienteTelefono.replace(/\s+/g, '')}`}
                            title={`Llamar · ${cliente.clienteTelefono}`}
                            className="flex size-8 items-center justify-center rounded-lg text-primary-600 transition-colors hover:bg-primary-50"
                          >
                            <Phone size={15} />
                          </a>
                        </>
                      ) : null}
                      {cliente.clienteCorreo ? (
                        <a
                          href={`mailto:${cliente.clienteCorreo}`}
                          title={cliente.clienteCorreo}
                          className="flex size-8 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100"
                        >
                          <Mail size={15} />
                        </a>
                      ) : null}
                      {!cliente.clienteTelefono && !cliente.clienteCorreo ? (
                        <span className="text-xs text-neutral-400">Sin datos</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">
                    {tipoNombrePorId.get(cliente.tipoVehiculoId) ?? '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-neutral-900">{cliente.placa}</td>
                  <td className="px-5 py-3 text-neutral-700">
                    {comboNombrePorId.get(cliente.ultimoComboId) ?? '—'}
                    <span className="ml-1.5 text-xs text-neutral-400">
                      {new Date(cliente.ultimoServicioEn).toLocaleDateString('es-CO')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-neutral-700">{cliente.totalServicios}</td>
                </tr>
              ))}
              {filtrados.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-neutral-400" colSpan={6}>
                    No hay clientes que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
