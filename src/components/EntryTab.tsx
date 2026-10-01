import { useState } from 'react'
import type { Data } from '../App'
import { currentRatings, eloDelta, expectedScore, rankOf, START_ELO } from '../lib/elo'
import { store } from '../lib/store'
import { percent } from '../lib/format'
import { emptyPick, NEW, type PickValue } from '../lib/pick'
import { Delta, RankMove } from './format'
import PlayerPicker from './PlayerPicker'
import CharacterPicker from './CharacterPicker'
import { resolveCharacter } from '../lib/characters'

interface Outcome {
  rows: { name: string; before: number; after: number; rankBefore: number; rankAfter: number }[]
  scoreA: number
  scoreB: number
}

export default function EntryTab({ data, prefill }: { data: Data; prefill?: [number, number] }) {
  const [a, setA] = useState<PickValue>(prefill ? { choice: String(prefill[0]), newName: '' } : emptyPick)
  const [b, setB] = useState<PickValue>(prefill ? { choice: String(prefill[1]), newName: '' } : emptyPick)
  const [charA, setCharA] = useState<PickValue>(emptyPick)
  const [charB, setCharB] = useState<PickValue>(emptyPick)
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  const eloOf = (p: PickValue) => (p.choice && p.choice !== NEW ? (data.ratings.get(Number(p.choice)) ?? START_ELO) : START_ELO)
  const nameOf = (p: PickValue) => (p.choice === NEW ? p.newName.trim() : (data.byId.get(Number(p.choice))?.name ?? ''))
  const sa = scoreA === '' ? NaN : Number(scoreA)
  const sb = scoreB === '' ? NaN : Number(scoreB)
  const picked = (p: PickValue) => (p.choice === NEW ? p.newName.trim() !== '' : p.choice !== '')
  const samePlayer =
    (a.choice !== NEW && a.choice !== '' && a.choice === b.choice) ||
    (a.choice === NEW && b.choice === NEW && nameOf(a).toLowerCase() === nameOf(b).toLowerCase())
  const validScores = Number.isInteger(sa) && Number.isInteger(sb) && sa >= 0 && sb >= 0
  const ready = picked(a) && picked(b) && !samePlayer && validScores

  const eloA = eloOf(a)
  const eloB = eloOf(b)
  const delta = ready ? eloDelta(eloA, eloB, sa, sb) : 0

  const resolve = async (p: PickValue): Promise<number> => {
    if (p.choice !== NEW) return Number(p.choice)
    const name = p.newName.trim()
    const existing = data.players.find((x) => x.name.toLowerCase() === name.toLowerCase())
    if (existing) return existing.id
    return (await store.addPlayer(name)).id
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const idA = await resolve(a)
      const idB = await resolve(b)
      const heroA = data.charactersEnabled ? await resolveCharacter(charA, data.characters) : null
      const heroB = data.charactersEnabled ? await resolveCharacter(charB, data.characters) : null
      const withNew = await data.refresh()
      const before = currentRatings(withNew.players, withNew.games)
      const game = await store.addGame({ player_a_id: idA, player_b_id: idB, score_a: sa, score_b: sb, character_a_id: heroA, character_b_id: heroB })
      const fresh = await data.refresh()
      const after = currentRatings(fresh.players, fresh.games)
      const name = (id: number) => fresh.players.find((p) => p.id === id)?.name ?? '?'
      setOutcome({
        scoreA: game.score_a,
        scoreB: game.score_b,
        rows: [
          { name: name(idA), before: game.elo_a_before, after: game.elo_a_after, rankBefore: rankOf(before, idA), rankAfter: rankOf(after, idA) },
          { name: name(idB), before: game.elo_b_before, after: game.elo_b_after, rankBefore: rankOf(before, idB), rankAfter: rankOf(after, idB) },
        ],
      })
      setA(emptyPick)
      setB(emptyPick)
      setCharA(emptyPick)
      setCharB(emptyPick)
      setScoreA('')
      setScoreB('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {outcome && (
        <section className="card result" aria-live="polite">
          <h2>
            Gespeichert: {outcome.rows[0].name} {outcome.scoreA} : {outcome.scoreB} {outcome.rows[1].name}
          </h2>
          {outcome.rows.map((r) => (
            <div className="result-row" key={r.name}>
              <div>
                <div className="name">{r.name}</div>
                <RankMove before={r.rankBefore} after={r.rankAfter} />
              </div>
              <Delta value={r.after - r.before} />
              <span className="num">
                {r.before} → <strong>{r.after}</strong>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Ergebnis eintragen</h2>
        <div className="duel">
          <div className="side">
            <PlayerPicker label="Spieler A" players={data.players} ratings={data.ratings} value={a} onChange={setA} exclude={b.choice} />
            {data.charactersEnabled && (
              <CharacterPicker id="hero-a" label="Held Spieler A" characters={data.characters} value={charA} onChange={setCharA} />
            )}
            <input
              className="score-input"
              inputMode="numeric"
              placeholder="Punkte"
              aria-label="Punkte Spieler A"
              value={scoreA}
              onChange={(e) => setScoreA(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <span className="vs">vs</span>
          <div className="side">
            <PlayerPicker label="Spieler B" players={data.players} ratings={data.ratings} value={b} onChange={setB} exclude={a.choice} />
            {data.charactersEnabled && (
              <CharacterPicker id="hero-b" label="Held Spieler B" characters={data.characters} value={charB} onChange={setCharB} />
            )}
            <input
              className="score-input"
              inputMode="numeric"
              placeholder="Punkte"
              aria-label="Punkte Spieler B"
              value={scoreB}
              onChange={(e) => setScoreB(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </div>

        {picked(a) && picked(b) && !samePlayer && (
          <div className="preview">
            Gewinnchance {nameOf(a)}: <strong>{percent(expectedScore(eloA, eloB))}</strong>
            {ready && (
              <>
                <br />
                {nameOf(a)} <Delta value={delta} /> → {eloA + delta}, {nameOf(b)} <Delta value={-delta} /> → {eloB - delta}
              </>
            )}
          </div>
        )}
        {samePlayer && <p className="error">Zweimal derselbe Spieler.</p>}

        <div className="actions">
          <button className="primary" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Speichere…' : 'Ergebnis speichern'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </>
  )
}
