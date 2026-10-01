import type { Data } from '../App'
import { standings } from '../lib/elo'
import { Delta } from './format'

const FORM_GAMES = 5

export default function TableTab({ data }: { data: Data }) {
  const rows = standings(data.players, data.games, data.ratings)

  // Elo change over each player's last few games.
  const form = new Map<number, number>()
  const seen = new Map<number, number>()
  for (const g of [...data.games].sort((x, y) => y.id - x.id)) {
    for (const [pid, d] of [
      [g.player_a_id, g.elo_a_after - g.elo_a_before],
      [g.player_b_id, g.elo_b_after - g.elo_b_before],
    ]) {
      const n = seen.get(pid) ?? 0
      if (n >= FORM_GAMES) continue
      seen.set(pid, n + 1)
      form.set(pid, (form.get(pid) ?? 0) + d)
    }
  }

  if (!rows.length) {
    return (
      <section className="card">
        <h2>Tabelle</h2>
        <p className="muted">Noch keine Spieler. Trag das erste Ergebnis ein oder importiere die Historie unter „Verlauf“.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <h2>Tabelle</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Spieler</th>
            <th>Elo</th>
            <th>Spiele</th>
            <th title="Siege / Niederlagen / Unentschieden">S/N/U</th>
            <th className="hide-narrow" title={`Elo-Änderung der letzten ${FORM_GAMES} Spiele`}>
              Form
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.player.id} className={r.rank === 1 ? 'top1' : undefined}>
              <td>{r.rank}</td>
              <td>{r.player.name}</td>
              <td className="elo">{r.elo}</td>
              <td>{r.games}</td>
              <td>
                {r.wins}/{r.losses}/{r.draws}
              </td>
              <td className="hide-narrow">{r.games ? <Delta value={form.get(r.player.id) ?? 0} /> : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
