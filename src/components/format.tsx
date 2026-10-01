import { signed } from '../lib/format'

export function Delta({ value }: { value: number }) {
  return <span className={`num ${value > 0 ? 'up' : value < 0 ? 'down' : 'same'}`}>{signed(value)}</span>
}

/** Rank movement; a lower rank number is better. */
export function RankMove({ before, after }: { before: number; after: number }) {
  const diff = before - after
  if (diff === 0) return <span className="same small">Platz {after}</span>
  return (
    <span className={`small ${diff > 0 ? 'up' : 'down'}`}>
      Platz {before} → {after} {diff > 0 ? `▲${diff}` : `▼${-diff}`}
    </span>
  )
}
