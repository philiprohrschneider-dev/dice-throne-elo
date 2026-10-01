import { useMemo, useState } from 'react'
import type { Data } from '../App'
import { computeWhr, DEFAULT_W2 } from '../lib/whr'

export default function WhrTab({ data }: { data: Data }) {
  const [info, setInfo] = useState(false)
  // Recomputed from the complete history whenever any game is added, corrected or deleted.
  const rows = useMemo(() => computeWhr(data.players, data.games), [data.players, data.games])

  return (
    <section className="card">
      <div className="card-head">
        <h2>WHR-Tabelle</h2>
        <button className="info-btn" aria-expanded={info} aria-controls="whr-info" aria-label="Was ist WHR?" onClick={() => setInfo(!info)}>
          i
        </button>
      </div>
      {info && (
        <div id="whr-info" className="info-box small">
          <p>
            <strong>Whole-History Rating</strong> bewertet alle Spiele gemeinsam statt eins nach dem anderen. Nach jeder Partie wird die
            komplette Historie neu berechnet: Wenn dein früherer Gegner später stark spielt, zählt dein alter Sieg gegen ihn rückwirkend
            mehr.
          </p>
          <p>
            Gezählt wird nur Sieg, Niederlage oder Unentschieden, nicht die Punktedifferenz. Die Spielstärke darf sich mit der Zeit ändern
            (Drift-Varianz w² = {DEFAULT_W2} pro Partie in der Runde). Das ± zeigt, wie sicher die Wertung ist: Wer wenig gespielt hat, hat ein großes ±.
          </p>
          <p className="muted">Die Elo-Tabelle bleibt die offizielle Wertung. WHR ist eine zweite Sicht.</p>
        </div>
      )}
      {!rows.length ? (
        <p className="muted">Noch keine Spieler.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Spieler</th>
              <th>WHR</th>
              <th title="Unsicherheit (eine Standardabweichung)">±</th>
              <th>Spiele</th>
              <th className="hide-narrow">Elo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player.id} className={r.rank === 1 ? 'top1' : undefined}>
                <td>{r.rank}</td>
                <td>{r.player.name}</td>
                <td className="elo">{r.games ? r.rating : '–'}</td>
                <td className="muted">{r.games ? r.uncertainty : ''}</td>
                <td>{r.games}</td>
                <td className="hide-narrow muted">{data.ratings.get(r.player.id) ?? 1000}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
