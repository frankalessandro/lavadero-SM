// Al anular una venta, quitar un producto o anular una cuenta hay que decir qué pasó con el
// producto físico (0068). La auditoría de inventario encontró cuentas anuladas "porque ya se
// pagó" cuyo producto sí se consumió: el sistema lo daba por devuelto y el siguiente conteo
// marcaba un faltante falso. Sin elección previa, para que nadie lo pase por alto.
export function DestinoProductoAnulado({
  value,
  onChange,
  plural = false,
}: {
  value: boolean | null
  onChange: (seConsumio: boolean) => void
  plural?: boolean
}) {
  const opciones = [
    { seConsumio: false, label: plural ? 'Volvieron a la nevera' : 'Volvió a la nevera' },
    { seConsumio: true, label: plural ? 'Se consumieron' : 'Se consumió' },
  ]
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="font-medium text-neutral-700">¿Qué pasó con {plural ? 'los productos' : 'el producto'}?</span>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
        {opciones.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(o.seConsumio)}
            aria-pressed={value === o.seConsumio}
            className={`rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
              value === o.seConsumio ? 'bg-white text-neutral-900 shadow-card' : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {value === true ? (
        <span className="text-xs text-neutral-500">
          Sale del inventario como consumo sin cobro, a nombre de quien anula.
        </span>
      ) : value === false ? (
        <span className="text-xs text-neutral-500">Queda disponible otra vez en el inventario.</span>
      ) : null}
    </div>
  )
}
