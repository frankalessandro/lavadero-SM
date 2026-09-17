import { db } from '../lib/db'
import {
  abrirCuentaInputSchema,
  anularCuentaInputSchema,
  cuentaSchema,
  type AbrirCuentaInput,
  type AnularCuentaInput,
  type Cuenta,
} from '../schemas/cuenta'
import type { PagoLineaInput } from '../schemas/pago'
import type { Deudor } from '../schemas/deudaPersonal'

const CUENTA_SELECT =
  'id, titular, nota, estado, abiertaPor:abierta_por, abiertaEn:abierta_en, cerradaEn:cerrada_en, cerradaPor:cerrada_por, turnoId:turno_id, aCosto:a_costo, destinatarioId:destinatario_id, motivo, autorizadoPor:autorizado_por, creadoEn:creado_en'

function inicioDeHoyISO(): string {
  const ahora = new Date()
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).toISOString()
}

// La más vieja primero — es la que más urge cerrar.
export async function fetchCuentasAbiertas(): Promise<Cuenta[]> {
  const { data, error } = await db
    .from('cuentas')
    .select(CUENTA_SELECT)
    .eq('estado', 'abierta')
    .order('abierta_en', { ascending: true })
  if (error) throw new Error(error.message)
  return cuentaSchema.array().parse(data)
}

// Abiertas hoy O cerradas hoy (una cuenta abierta ayer y cerrada hoy debe salir igual) — para
// juntarlas con "Ventas de hoy" en un solo listado por comprobante.
export async function fetchCuentasHoy(): Promise<Cuenta[]> {
  const hoy = inicioDeHoyISO()
  const { data, error } = await db
    .from('cuentas')
    .select(CUENTA_SELECT)
    .or(`abierta_en.gte.${hoy},cerrada_en.gte.${hoy}`)
    .order('abierta_en', { ascending: false })
  if (error) throw new Error(error.message)
  return cuentaSchema.array().parse(data)
}

export async function abrirCuenta(input: AbrirCuentaInput): Promise<Cuenta> {
  const parsed = abrirCuentaInputSchema.parse(input)
  const { data, error } = await db
    .rpc('abrir_cuenta', {
      p_titular: parsed.titular,
      p_nota: parsed.nota ?? null,
      p_abierta_por: parsed.abiertaPor,
      p_a_costo: parsed.aCosto,
      p_destinatario_id: parsed.aCosto ? parsed.destinatarioId : null,
      p_motivo: parsed.aCosto ? parsed.motivo : null,
      p_autorizado_por: parsed.aCosto ? parsed.autorizadoPor : null,
    })
    .select(CUENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return cuentaSchema.parse(data)
}

// Cierra la cuenta cobrando todos sus productos pendientes juntos, con pago partido (1-3 líneas
// que deben sumar exacto — mismo motor que `cobrarYEntregarOrden`/`createVentaCarrito`). Va por
// la RPC `cerrar_cuenta` (0041): liquida cada pendiente (descuenta stock, snapshot de costo) y
// marca la cuenta `cerrada` en una sola transacción.
export async function cerrarCuenta(cuentaId: string, pagos: PagoLineaInput[], cerradaPor: string): Promise<Cuenta> {
  const { data, error } = await db
    .rpc('cerrar_cuenta', {
      p_cuenta_id: cuentaId,
      p_pagos: pagos.map((l) => ({ metodo: l.metodo, monto: l.monto, referencia: l.referencia ?? null })),
      p_cerrada_por: cerradaPor,
    })
    .select(CUENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return cuentaSchema.parse(data)
}

// Cierra la cuenta cargándola a un trabajador (lavador, jefe de patio o gerencia; 0065 → 0070) en
// vez de cobrar plata — mismo descuento de stock/costo que cerrarCuenta, sin pago hoy: el total
// queda como deuda de esa persona (src/data/deudasPersonal.ts), que se salda con abonos o
// descontándola al liquidar. Si la cuenta es a costo (0073), el servidor ignora `deudor` y carga
// siempre al gerente con el que se abrió — ya quedó fijo (y autorizado) al abrir.
export async function cargarCuentaAPersonal(cuentaId: string, deudor: Deudor, cerradaPor: string): Promise<Cuenta> {
  const { data, error } = await db
    .rpc('cargar_cuenta_a_personal', {
      p_cuenta_id: cuentaId,
      p_lavador_id: deudor.tipo === 'lavador' ? deudor.id : null,
      p_persona_id: deudor.tipo === 'persona' ? deudor.id : null,
      p_cerrada_por: cerradaPor,
    })
    .select(CUENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return cuentaSchema.parse(data)
}

// Cancela una cuenta abierta sin cobrar (se fue sin pagar, error al abrirla) — regla 13: motivo
// obligatorio, queda visible. Sus ventas pendientes nunca movieron stock, así que se anulan sin
// reverso de inventario.
export async function anularCuenta(cuentaId: string, input: AnularCuentaInput): Promise<Cuenta> {
  const parsed = anularCuentaInputSchema.parse(input)
  const { data, error } = await db
    .rpc('anular_cuenta', {
      p_cuenta_id: cuentaId,
      p_motivo: parsed.motivo,
      p_anulada_por: parsed.anuladaPor,
      p_se_consumio: parsed.seConsumio,
    })
    .select(CUENTA_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return cuentaSchema.parse(data)
}
