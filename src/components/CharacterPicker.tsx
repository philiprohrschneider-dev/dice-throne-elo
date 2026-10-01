import type { Character } from '../lib/elo'
import { NEW, type PickValue } from '../lib/pick'

interface Props {
  id: string
  label: string
  characters: Character[]
  value: PickValue
  onChange: (v: PickValue) => void
}

/** Optional hero choice; '' means "no hero recorded". */
export default function CharacterPicker({ id, label, characters, value, onChange }: Props) {
  const sorted = [...characters].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return (
    <div className="side">
      <select id={id} aria-label={label} value={value.choice} onChange={(e) => onChange({ ...value, choice: e.target.value })}>
        <option value="">Held</option>
        {sorted.map((c) => (
          <option key={c.id} value={String(c.id)}>
            {c.name}
          </option>
        ))}
        <option value={NEW}>＋ Neuer Held…</option>
      </select>
      {value.choice === NEW && (
        <input
          autoFocus
          placeholder="Name des Helden"
          aria-label={`${label}: Name`}
          maxLength={40}
          value={value.newName}
          onChange={(e) => onChange({ ...value, newName: e.target.value })}
        />
      )}
    </div>
  )
}
