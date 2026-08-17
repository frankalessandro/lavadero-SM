import type { Combo } from '../schemas/combo'

// Catálogo semilla — sección 5/M1 del Plan de Alcance. Precios en `precios.ts`
// son valores de ejemplo, pendientes de la lista real que suministra el cliente (§11).
export const COMBOS: Combo[] = [
  { id: 'combo-auto-1', nombre: 'Combo 1 — Lavado y aspirado', activo: true },
  { id: 'combo-auto-2', nombre: 'Combo 2 — + Brillado', activo: true },
  { id: 'combo-auto-3', nombre: 'Combo 3 — + Lavado de motor', activo: true },
  { id: 'combo-auto-4', nombre: 'Combo 4 — + Brillado + lavado de motor', activo: true },
  { id: 'combo-auto-5', nombre: 'Combo 5 — + Rasqueteada', activo: true },
  { id: 'combo-auto-6', nombre: 'Combo 6 — + Lavado de cojinería', activo: true },
  { id: 'combo-moto-1', nombre: 'Combo 1 — Lavado y desengrasada', activo: true },
  { id: 'combo-moto-2', nombre: 'Combo 2 — + Brillado', activo: true },
  { id: 'combo-moto-3', nombre: 'Combo 3 — Lavado y grafitada', activo: true },
  { id: 'combo-moto-4', nombre: 'Combo 4 — + Desengrasada + brillado + grafitada', activo: true },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchCombos(): Promise<Combo[]> {
  await delay(200)
  return [...COMBOS]
}
