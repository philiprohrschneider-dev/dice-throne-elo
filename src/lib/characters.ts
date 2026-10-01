import type { Character } from './elo'
import { NEW, type PickValue } from './pick'
import { store } from './store'

/** Turns a hero choice into an id, creating the hero if it is new. '' or an empty new name = no hero. */
export async function resolveCharacter(p: PickValue, characters: Character[]): Promise<number | null> {
  if (p.choice === '') return null
  if (p.choice !== NEW) return Number(p.choice)
  const name = p.newName.trim()
  if (!name) return null
  const existing = characters.find((c) => c.name.toLowerCase() === name.toLowerCase())
  if (existing) return existing.id
  return (await store.addCharacter(name)).id
}

export const pickOf = (id: number | null | undefined): PickValue => ({ choice: id ? String(id) : '', newName: '' })
