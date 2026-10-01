import { useState } from 'react'
import type { Data } from '../App'
import type { Game } from '../lib/elo'
import { parseImport, store } from '../lib/store'
import { formatDate } from '../lib/format'
import type { PickValue } from '../lib/pick'
import { Delta } from './format'
import PlayerPicker from './PlayerPicker'

const PAGE = 30

export default function HistoryTab({ data }: { data: Data }) {
  const [filter, setFilter] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState<number | null>(null)

  // Game number = position in the chronological order, stable for display.
  const ordered = [...data.games].sort((x, y) => x.id - y.id)
  const number = new Map(ordered.map((g, i) => [g.id, i + 1]))
  const filtered = ordered
    .filter((g) => !filter || g.player_a_id === Number(filter) || g.player_b_id === Number(filter))
    .reverse()

  return (
    <>
      <section className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Letzte Spiele</h2>
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
        {!filtered.length && <p className="muted">Noch keine Spiele.</p>}
        {filtered.slice(0, limit).map((g) =>
          editing === g.id ? (
            <EditGame key={g.id} data={data} game={g} onDone={() => setEditing(null)} />
          ) : (
            <GameRow key={g.id} data={data} game={g} no={number.get(g.id)!} onEdit={() => setEditing(g.id)} />
          ),
        )}
        {filtered.length > limit && (
          <div className="actions">
            <button className="secondary" onClick={() => setLimit(limit + PAGE)}>
              Mehr anzeigen ({filtered.length - limit} weitere)
            </button>
          </div>
        )}
      </section>
      <DataCard data={data} />
    </>
  )
}

function GameRow({ data, game: g, no, onEdit }: { data: Data; game: Game; no: number; onEdit: () => void }) {
  const name = (id: number) => data.byId.get(id)?.name ?? '?'
  const dA = g.elo_a_after - g.elo_a_before
  return (
    <div className="game">
      <div className="game-head">
        <span>
          Spiel {no} · {formatDate(g.played_at)}
        </span>
        <button className="link" onClick={onEdit}>
          Korrigieren
        </button>
      </div>
      <div className="game-body">
        <div>
          <span className={g.score_a > g.score_b ? 'winner' : undefined}>{name(g.player_a_id)}</span>{' '}
          <Delta value={dA} />
          <div className="muted small num">{g.elo_a_after}</div>
        </div>
        <div className="score num">
          {g.score_a} : {g.score_b}
        </div>
        <div className="b">
          <Delta value={-dA} /> <span className={g.score_b > g.score_a ? 'winner' : undefined}>{name(g.player_b_id)}</span>
          <div className="muted small num">{g.elo_b_after}</div>
        </div>
      </div>
    </div>
  )
}

function EditGame({ data, game, onDone }: { data: Data; game: Game; onDone: () => void }) {
  const [a, setA] = useState<PickValue>({ choice: String(game.player_a_id), newName: '' })
  const [b, setB] = useState<PickValue>({ choice: String(game.player_b_id), newName: '' })
  const [sa, setSa] = useState(String(game.score_a))
  const [sb, setSb] = useState(String(game.score_b))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const later = data.games.filter((g) => g.id > game.id).length
  const valid = a.choice && b.choice && a.choice !== b.choice && sa !== '' && sb !== ''

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      await data.refresh()
      onDone()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const save = () =>
    run(() =>
      store.updateGame(game.id, { player_a_id: Number(a.choice), player_b_id: Number(b.choice), score_a: Number(sa), score_b: Number(sb) }),
    )
  const remove = () => {
    if (window.confirm('Dieses Spiel wirklich löschen? Alle späteren Elo-Werte werden neu berechnet.')) run(() => store.deleteGame(game.id))
  }

  return (
    <div className="game">
      <div className="duel">
        <div className="side">
          <PlayerPicker label="Spieler A" players={data.players} ratings={data.ratings} value={a} onChange={setA} exclude={b.choice} allowNew={false} />
          <input className="score-input" inputMode="numeric" aria-label="Punkte A" value={sa} onChange={(e) => setSa(e.target.value.replace(/\D/g, ''))} />
        </div>
        <span className="vs">vs</span>
        <div className="side">
          <PlayerPicker label="Spieler B" players={data.players} ratings={data.ratings} value={b} onChange={setB} exclude={a.choice} allowNew={false} />
          <input className="score-input" inputMode="numeric" aria-label="Punkte B" value={sb} onChange={(e) => setSb(e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>
      {later > 0 && <p className="muted small">Danach wurden {later} Spiele gespielt; deren Elo-Werte werden automatisch neu berechnet.</p>}
      <div className="actions">
        <button className="primary" disabled={!valid || busy} onClick={save}>
          Korrektur speichern
        </button>
        <button className="secondary" disabled={busy} onClick={onDone}>
          Abbrechen
        </button>
        <button className="danger" disabled={busy} onClick={remove}>
          Löschen
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}

function DataCard({ data }: { data: Data }) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(data.games.length === 0)

  const onFile = async (file: File) => {
    setBusy(true)
    setMessage(null)
    try {
      const rows = parseImport(await file.text())
      const n = await store.importGames(rows)
      await data.refresh()
      setMessage(`${n} Spiele importiert.`)
    } catch (e) {
      setMessage(`Import fehlgeschlagen: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const exportJson = () => {
    const name = (id: number) => data.byId.get(id)?.name ?? '?'
    const rows = [...data.games].sort((x, y) => x.id - y.id).map((g) => [name(g.player_a_id), name(g.player_b_id), g.score_a, g.score_b])
    const blob = new Blob([JSON.stringify(rows, null, 1)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `games-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="card">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>Daten importieren / sichern</summary>
        <p className="small muted">
          Import erwartet eine games.json im Format [SpielerA, SpielerB, PunkteA, PunkteB], chronologisch. Geht nur, solange noch
          keine Spiele eingetragen sind.
        </p>
        <div className="row">
          <input type="file" accept="application/json,.json" disabled={busy || data.games.length > 0} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <button className="secondary" onClick={exportJson} disabled={!data.games.length}>
            Als games.json exportieren
          </button>
        </div>
        {message && <p className="small">{message}</p>}
      </details>
    </section>
  )
}
