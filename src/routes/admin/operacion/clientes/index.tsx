import { useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Coins, Mail, MessageCircle, Phone, Repeat, Search, UserPlus } from 'lucide-react'
import { fetchClientes, type ClienteResumen } from '../../../../data/clientes'
import { fetchTiposVehiculo } from '../../../../data/tiposVehiculo'
import { fetchCombos } from '../../../../data/combos'
import { fetchLavadores } from '../../../../data/lavadores'
import { fetchProductos } from '../../../../data/productos'
import { Card } from '../../../../components/layout/Card'
import { StatCard } from '../../../../components/layout/StatCard'
import { ClienteExpedienteModal } from '../../../../components/layout/ClienteExpedienteModal'
import { FilaFiltros, FiltroTexto, FiltroVacio } from '../../../../components/layout/TableHeadFilter'
import { coincide } from '../../../../lib/tableFilters'

// Mismo criterio de indicativo que src/components/layout/ContactoModal.tsx.
function whatsappHref(telefono: string, mensaje: string): string {
  const digitos = telefono.replace(/\D/g, '')
  const conIndicativo = digitos.length === 10 ? `57${digitos}` : digitos
  return `https://wa.me/${conIndicativo}?text=${encodeURIComponent(mensaje)}`
}

async function loadClientesPage() {
  const [clientes, tiposVehiculo, combos, lavadores, productos] = await Promise.all([
    fetchClientes(),
    fetchTiposVehiculo(),
    fetchCombos(),
    fetchLavadores(),
    fetchProductos(),
  ])
  return { clientes, tiposVehiculo, combos, lavadores, productos }
}

export const Route = createFileRoute('/admin/operacion/clientes/')({
  loader: loadClientesPage,
  component: ClientesPage,
})

function ClientesPage() {
  const { clientes, tiposVehiculo, combos, lavadores, productos } = Route.useLoaderData()
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [orden, setOrden] = useState<'recientes' | 'gastado' | 'frecuencia'>('recientes')
  const [expedienteDe, setExpedienteDe] = useState<{ placa: string; nombre: string } | null>(null)

  const tipoNombrePorId = new Map(tiposVehiculo.map((t) => [t.id, t.nombre]))
  const comboNombrePorId = new Map(combos.map((c) => [c.id, c.nombre]))
  const lavadorNombrePorId = new Map(lavadores.map((l) => [l.id, l.nombre]))
  const productoNombrePorId = new Map(productos.map((p) => [p.id, p.nombre]))

  const filtrados = useMemo(() => {
    const base = clientes.filter(
      (c) => coincide(c.clienteNombre, filtroCliente) && coincide(c.placa, filtroPlaca),
    )
    const cmp: Record<typeof orden, (a: ClienteResumen, b: ClienteResumen) => number> = {
      recientes: (a, b) => new Date(b.ultimoServicioEn).getTime() - new Date(a.ultimoServicioEn).getTime(),
      gastado: (a, b) => b.totalGastado - a.totalGastado,
      frecuencia: (a, b) => b.totalServicios - a.totalServicios,
    }
    return [...base].sort(cmp[orden])
  }, [clientes, filtroCliente, filtroPlaca, orden])

  const conTelefono = clientes.filter((c) => c.clienteTelefono).length
  const recurrentes = clientes.filter((c) => c.totalServicios > 1).length
  const inicioMes = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()
  const nuevosDelMes = clientes.filter((c) => c.primerServicioEn.slice(0, 10) >= inicioMes).length
  const gastoTotalBase = clientes.reduce((s, c) => s + c.totalGastado, 0)
  const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

  return (
    <div className="flex flex-col gap-6 text-left">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">Clientes</h2>
        <p className="text-sm text-neutral-500">
          Base de clientes construida a partir del histórico de órdenes (M2) — un registro por placa.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Clientes registrados" value={String(clientes.length)} hint={`${conTelefono} con teléfono`} icon={Search} />
        <StatCard label="Recurrentes" value={String(recurrentes)} hint={`de ${clientes.length} · ${clientes.length ? Math.round((recurrentes / clientes.length) * 100) : 0}%`} icon={Repeat} />
        <StatCard label="Nuevos este mes" value={String(nuevosDelMes)} icon={UserPlus} />
        <StatCard label="Facturado histórico" value={COP.format(gastoTotalBase)} hint="órdenes entregadas" icon={Coins} />
      </div>

      <div className="flex w-fit rounded-lg border border-neutral-300 p-1">
        {([['recientes', 'Recientes'], ['gastado', 'Más gastan'], ['frecuencia', 'Más frecuentes']] as const).map(
          ([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setOrden(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                orden === k ? 'bg-primary-600 text-white shadow-nav-active' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

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
                <th className="px-5 py-3 text-right">Servicios</th>
                <th className="px-5 py-3 text-right">Total gastado</th>
                <th className="px-5 py-3 text-right">Ticket prom.</th>
              </tr>
              <FilaFiltros>
                <FiltroTexto value={filtroCliente} onChange={setFiltroCliente} placeholder="Buscar…" />
                <FiltroVacio />
                <FiltroVacio />
                <FiltroTexto value={filtroPlaca} onChange={setFiltroPlaca} placeholder="Placa…" />
                <FiltroVacio />
                <FiltroVacio />
                <FiltroVacio />
                <FiltroVacio />
              </FilaFiltros>
            </thead>
            <tbody>
              {filtrados.map((cliente) => (
                <tr
                  key={cliente.placa}
                  onClick={() => setExpedienteDe({ placa: cliente.placa, nombre: cliente.clienteNombre })}
                  className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-primary-50/40"
                >
                  <td className="px-5 py-3 font-medium text-neutral-900">
                    {cliente.clienteNombre}
                    <span className="ml-1.5 text-xs font-normal text-primary-600">Ver expediente</span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
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
                  <td className="px-5 py-3 text-right text-neutral-700">{cliente.totalServicios}</td>
                  <td className="px-5 py-3 text-right font-medium text-neutral-900">{COP.format(cliente.totalGastado)}</td>
                  <td className="px-5 py-3 text-right text-neutral-600">{COP.format(cliente.ticketPromedio)}</td>
                </tr>
              ))}
              {filtrados.length === 0 ? (
                <tr>
                  <td className="px-5 py-6 text-center text-neutral-400" colSpan={8}>
                    No hay clientes que coincidan con la búsqueda.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {expedienteDe ? (
        <ClienteExpedienteModal
          placa={expedienteDe.placa}
          nombreFallback={expedienteDe.nombre}
          tipoNombre={(id) => tipoNombrePorId.get(id) ?? '—'}
          comboNombre={(id) => (id ? comboNombrePorId.get(id) ?? '—' : 'Sin combo')}
          lavadorNombre={(id) => (id ? lavadorNombrePorId.get(id) : undefined)}
          productoNombre={(id) => productoNombrePorId.get(id) ?? 'Producto'}
          onClose={() => setExpedienteDe(null)}
        />
      ) : null}
    </div>
  )
}
