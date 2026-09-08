import { db } from '../lib/db'
import {
  personalOperativoInputSchema,
  personalOperativoSchema,
  type PersonalOperativo,
  type PersonalOperativoInput,
} from '../schemas/personalOperativo'

const PERSONAL_SELECT = 'id, nombre, nivel, telefono, activo, creadoEn:creado_en'

// Roster completo (activos primero). Lo lee todo el personal autenticado — es la lista del
// selector de "quién abre el turno", que reemplazó al input de texto libre que produjo 13
// grafías para 3 personas (ver 0043_personal_operativo.sql).
export async function fetchPersonalOperativo(): Promise<PersonalOperativo[]> {
  const { data, error } = await db
    .from('personal_operativo')
    .select(PERSONAL_SELECT)
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw new Error(error.message)
  return personalOperativoSchema.array().parse(data)
}

export async function createPersonalOperativo(input: PersonalOperativoInput): Promise<PersonalOperativo> {
  const parsed = personalOperativoInputSchema.parse(input)
  const { data, error } = await db
    .from('personal_operativo')
    .insert({ nombre: parsed.nombre, nivel: parsed.nivel, telefono: parsed.telefono || null })
    .select(PERSONAL_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return personalOperativoSchema.parse(data)
}

export async function updatePersonalOperativo(
  id: string,
  input: PersonalOperativoInput,
): Promise<PersonalOperativo> {
  const parsed = personalOperativoInputSchema.parse(input)
  const { data, error } = await db
    .from('personal_operativo')
    .update({ nombre: parsed.nombre, nivel: parsed.nivel, telefono: parsed.telefono || null })
    .eq('id', id)
    .select(PERSONAL_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return personalOperativoSchema.parse(data)
}

// Regla 5/13: nunca borrado duro — una persona inactiva conserva sus turnos, órdenes y comisión
// histórica; solo deja de aparecer en los selectores.
export async function setPersonalOperativoActivo(id: string, activo: boolean): Promise<PersonalOperativo> {
  const { data, error } = await db
    .from('personal_operativo')
    .update({ activo })
    .eq('id', id)
    .select(PERSONAL_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return personalOperativoSchema.parse(data)
}
