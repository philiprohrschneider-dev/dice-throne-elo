import type { Player } from '../lib/elo'
import { NEW, type PickValue } from '../lib/pick'

interface Props {
  label: string
  players: Player[]
  ratings: Map<number, number>
  value: PickValue
  onChange: (v: PickValue) => void
  exclude?: string
  allowNew?: boolean
}

export default function PlayerPicker({ label, players, ratings, value, onChange, exclude, allowNew = true }: Props) {
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const id = `pick-${label.replace(/\W/g, '')}`
  return (
    <div className="side">
      <div>
        <label className="field" htmlFor={id}>
          {label}
        </label>
        <select id={id} value={value.choice} onChange={(e) => onChange({ ...value, choice: e.target.value })}>
          <option value="">Spieler wählen…</option>
          {sorted.map((p) => (
            <option key={p.id} value={String(p.id)} disabled={String(p.id) === exclude}>
              {p.name} ({ratings.get(p.id) ?? 1000})
            </option>
          ))}
          {allowNew && <option value={NEW}>＋ Neuer Spieler…</option>}
        </select>
      </div>
      {value.choice === NEW && (
        <input
          autoFocus
          placeholder="Name"
          maxLength={40}
          value={value.newName}
          onChange={(e) => onChange({ ...value, newName: e.target.value })}
        />
      )}
    </div>
  )
}
