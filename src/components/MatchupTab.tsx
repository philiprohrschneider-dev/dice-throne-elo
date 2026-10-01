import { useState } from 'react'
import type { Data } from '../App'
import { bestPairing, scorePairs, type PairInfo } from '../lib/matchups'
import { percent } from '../lib/format'

export default function MatchupTab({ data, onPlay }: { data: Data; onPlay: (a: number, b: number) => void }) {
  const [present, setPresent] = useState<Set<number>>(new Set())
  const [weight, setWeight] = useState(50)

  const players = [...data.players].sort((a, b) => a.name.localeCompare(b.name, 'de'))
  const ids = players.filter((p) => present.has(p.id)).map((p) => p.id)
  const pairs = ids.length >= 2 ? scorePairs(ids, data.ratings, data.games, weight / 100) : []
  const best = ids.length >= 2 && ids.length <= 20 ? bestPairing(ids, pairs) : null
  const name = (id: number) => data.byId.get(id)?.name ?? '?'

  const toggle = (id: number) => {
    const next = new Set(present)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPresent(next)
  }

  const Pair = ({ p }: { p: PairInfo }) => (
    <div className="pair">
      <div>
        <strong>{name(p.a)}</strong> vs <strong>{name(p.b)}</strong>
        {p.bridge && <span className="tag good" title="Keine gemeinsamen Gegner: verbindet zwei Grüppchen">Brücke</span>}
        {p.headToHead === 0 && !p.bridge && <span className="tag good">Erstes Duell</span>}
        <div className="small muted">
          {percent(p.winChanceA)} : {percent(1 - p.winChanceA)}
          {p.headToHead > 0 && ` · ${p.headToHead}× gegeneinander, zuletzt vor ${p.gamesSinceLastMeeting} Spielen`}
        </div>
      </div>
      <button className="link" onClick={() => onPlay(p.a, p.b)}>
        Eintragen
      </button>
      <div className="bar" aria-hidden>
        <span style={{ width: `${p.winChanceA * 100}%` }} />
      </div>
    </div>
  )

  return (
    <>
      <section className="card">
        <h2>Wer ist da?</h2>
        <div className="chips">
          {players.map((p) => (
            <button key={p.id} className="chip" aria-pressed={present.has(p.id)} onClick={() => toggle(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="link" onClick={() => setPresent(new Set(players.map((p) => p.id)))}>
            Alle
          </button>
          <button className="link" onClick={() => setPresent(new Set())}>
            Keiner
          </button>
        </div>
        <label className="field" htmlFor="weight" style={{ marginTop: 12 }}>
          Gewichtung: {weight < 40 ? 'mehr Abwechslung' : weight > 60 ? 'mehr Ausgeglichenheit' : 'ausgewogen'}
        </label>
        <div className="slider small muted">
          <span>Abwechslung</span>
          <input id="weight" type="range" min={0} max={100} step={10} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
          <span>Ausgeglichen</span>
        </div>
      </section>

      {ids.length < 2 && <p className="muted">Wähle mindestens zwei anwesende Spieler.</p>}

      {best && (
        <section className="card">
          <h2>Vorschlag für die Runde</h2>
          {best.pairs.map((p) => (
            <Pair key={`${p.a}-${p.b}`} p={p} />
          ))}
          {best.sittingOut !== null && <p className="small muted">Setzt aus: {name(best.sittingOut)}</p>}
        </section>
      )}

      {pairs.length > 1 && (
        <section className="card">
          <h2>Alle Paarungen, beste zuerst</h2>
          {pairs.slice(0, 15).map((p) => (
            <Pair key={`${p.a}-${p.b}`} p={p} />
          ))}
          <p className="small muted">
            Bewertet nach Gewinnchance (nah an 50 %) und Abwechslung (selten oder lange nicht gegeneinander gespielt). „Brücke“ heißt:
            die beiden hatten noch keinen gemeinsamen Gegner. Solche Spiele halten den ganzen Pool vergleichbar.
          </p>
        </section>
      )}
    </>
  )
}
