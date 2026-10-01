import { useMemo, useState } from 'react'
import type { Data } from '../App'

interface HeroRow {
  id: number
  name: string
  games: number
  wins: number
  losses: number
  draws: number
  players: Set<number>
  eloSum: number
}

export default function HeroesTab({ data }: { data: Data }) {
  const [filter, setFilter] = useState('')
  const playerId = filter ? Number(filter) : null

  const { rows, withHero } = useMemo(() => {
    const byHero = new Map<number, HeroRow>()
    let withHero = 0
    for (const g of data.games) {
      if (g.character_a_id || g.character_b_id) withHero++
      const sides = [
        { pid: g.player_a_id, cid: g.character_a_id, own: g.score_a, opp: g.score_b, delta: g.elo_a_after - g.elo_a_before },
        { pid: g.player_b_id, cid: g.character_b_id, own: g.score_b, opp: g.score_a, delta: g.elo_b_after - g.elo_b_before },
      ]
      for (const s of sides) {
        if (!s.cid || (playerId !== null && s.pid !== playerId)) continue
        let row = byHero.get(s.cid)
        if (!row) {
          row = { id: s.cid, name: data.charById.get(s.cid)?.name ?? '?', games: 0, wins: 0, losses: 0, draws: 0, players: new Set(), eloSum: 0 }
          byHero.set(s.cid, row)
        }
        row.games++
        row.players.add(s.pid)
        row.eloSum += s.delta
        if (s.own > s.opp) row.wins++
        else if (s.own < s.opp) row.losses++
        else row.draws++
      }
    }
    const rows = [...byHero.values()].sort((a, b) => b.games - a.games || b.wins / b.games - a.wins / a.games || a.name.localeCompare(b.name, 'de'))
    return { rows, withHero }
  }, [data.games, data.charById, playerId])

  if (!data.charactersEnabled) {
    return (
      <section className="card">
        <h2>Helden</h2>
        <p className="muted">
          Für Helden braucht die Datenbank noch ein kleines Update: supabase/migrations/002-characters.sql einmal im Supabase-SQL-Editor
          ausführen.
        </p>
      </section>
    )
  }

  const winRate = (r: HeroRow) => (r.wins + r.draws / 2) / r.games
  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Helden</h2>
        <select aria-label="Nach Spieler filtern" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Alle Spieler</option>
          {[...data.players]
            .sort((a, b) => a.name.localeCompare(b.name, 'de'))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {withHero} von {data.games.length} Spielen mit eingetragenem Helden. Wähl beim Eintragen einfach den Helden mit aus.
      </p>
      {!rows.length ? (
        <p className="muted">{playerId ? 'Für diesen Spieler sind noch keine Helden eingetragen.' : 'Noch keine Helden eingetragen.'}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="heroes">
            <thead>
              <tr>
                <th>Held</th>
                <th>Spiele</th>
                <th title="Siege / Niederlagen / Unentschieden">S/N/U</th>
                <th>Siegquote</th>
                <th className="hide-narrow" title="Summe der Elo-Änderungen mit diesem Helden">Elo ±</th>
                {playerId === null && <th className="hide-narrow">Spieler</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.games}</td>
                  <td>
                    {r.wins}/{r.losses}/{r.draws}
                  </td>
                  <td className="elo">{Math.round(winRate(r) * 100)} %</td>
                  <td className={`hide-narrow ${r.eloSum > 0 ? 'up' : r.eloSum < 0 ? 'down' : 'same'}`}>
                    {r.eloSum > 0 ? `+${r.eloSum}` : r.eloSum < 0 ? `−${-r.eloSum}` : '±0'}
                  </td>
                  {playerId === null && <td className="hide-narrow">{r.players.size}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
