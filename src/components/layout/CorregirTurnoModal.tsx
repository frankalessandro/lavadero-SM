import { useRef, useState, type FormEvent } from 'react'
import { ShieldAlert } from 'lucide-react'
import { corregirTurnoCerrado } from '../../data/turnos'
import { toast } from '../../lib/toast'
import type { TurnoCaja } from '../../schemas/turnoCaja'
import { Button } from './Button'
import { CurrencyInput } from './CurrencyInput'
import { Modal } from './Modal'

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })

interface Props {
  turno: TurnoCaja
  onCorregido: (turno: TurnoCaja) => void
  onClose: () => void
}

// Regla 14 revisada: un turno cerrado solo lo corrige gerencia, con causa justificada, y queda en
// la bitácora con antes/después (acción 'corregir_turno'). La diferencia la recalcula la base; acá
// solo se muestra como vista previa.
export function CorregirTurnoModal({ turno, onCorregido, onClose }: Props) {
  const [base, setBase] = useState(String(turno.baseInicial))
  const [conteo, setConteo] = useState(String(turno.conteoFisico ?? 0))
  const [esperado, setEsperado] = useState(String(turno.valorEsperado ?? 0))
  const [justificacion, setJustificacion] = useState(turno.justificacionDiferencia ?? '')
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)
  const enVuelo = useRef(false)

  const diferencia = Number(conteo || 0) - Number(esperado || 0)
  const motivoOk = motivo.trim().length >= 10
  const justificacionFalta = diferencia !== 0 && !justificacion.trim()

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (enVuelo.current || !motivoOk || justificacionFalta) return
    enVuelo.current = true
    setSaving(true)
    try {
      const nuevo = await corregirTurnoCerrado(turno.id, {
        motivo,
        baseInicial: Number(base || 0) !== turno.baseInicial ? Number(base || 0) : undefined,
        conteoFisico: Number(conteo || 0) !== (turno.conteoFisico ?? 0) ? Number(conteo || 0) : undefined,
        valorEsperado: Number(esperado || 0) !== (turno.valorEsperado ?? 0) ? Number(esperado || 0) : undefined,
        justificacionDiferencia:
          justificacion.trim() !== (turno.justificacionDiferencia ?? '') ? justificacion.trim() : undefined,
      })
      toast.exito('Turno corregido y registrado en la auditoría')
      onCorregido(nuevo)
    } catch (err) {
      toast.desdeError(err, 'No se pudo corregir el turno')
    } finally {
      enVuelo.current = false
      setSaving(false)
    }
  }

  const campo = 'rounded-xl border border-neutral-200 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500'

  return (
    <Modal
      title="Corregir arqueo de turno cerrado"
      subtitle="Solo gerencia. Queda registrado en la auditoría con lo que había antes."
      icon={ShieldAlert}
      tone="warning"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="danger" type="submit" form="corregir-turno" loading={saving} disabled={!motivoOk || justificacionFalta}>
            Corregir turno
          </Button>
        </>
      }
    >
      <form id="corregir-turno" onSubmit={submit} className="flex flex-col gap-5">
        <div className="grid gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Base inicial</span>
            <CurrencyInput size="sm" value={base} onChange={setBase} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Conteo físico</span>
            <CurrencyInput size="sm" value={conteo} onChange={setConteo} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-neutral-700">Valor esperado</span>
            <CurrencyInput size="sm" value={esperado} onChange={setEsperado} />
          </label>
        </div>

        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            diferencia === 0 ? 'bg-success-50 text-success-700' : diferencia < 0 ? 'bg-danger-50 text-danger-700' : 'bg-warning-50 text-warning-700'
          }`}
        >
          Diferencia resultante: <span className="font-semibold">{COP.format(diferencia)}</span>
          {turno.diferencia !== undefined ? ` (antes ${COP.format(turno.diferencia)})` : ''}
        </p>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Justificación de la diferencia</span>
          <textarea rows={2} className={campo} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
          {justificacionFalta ? <span className="text-xs text-danger-600">Obligatoria si hay diferencia.</span> : null}
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-700">Causa de la corrección</span>
          <textarea
            rows={3}
            className={campo}
            placeholder="Qué pasó y por qué se corrige (mínimo 10 caracteres)"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </label>
      </form>
    </Modal>
  )
}
