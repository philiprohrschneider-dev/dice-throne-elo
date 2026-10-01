import { useCallback, useEffect, useMemo, useState } from 'react'
import { currentRatings, type Game, type Player } from './lib/elo'
import { store, type Snapshot } from './lib/store'
import EntryTab from './components/EntryTab'
import TableTab from './components/TableTab'
import HistoryTab from './components/HistoryTab'
import MatchupTab from './components/MatchupTab'

const TABS = [
  { id: 'table', label: 'Tabelle' },
  { id: 'entry', label: 'Eintragen' },
  { id: 'history', label: 'Verlauf' },
  { id: 'matchups', label: 'Matchups' },
] as const
type TabId = (typeof TABS)[number]['id']

export interface Data {
  players: Player[]
  games: Game[]
  ratings: Map<number, number>
  byId: Map<number, Player>
  /** Reloads from the store and returns the fresh snapshot. */
  refresh: () => Promise<Snapshot>
}

function initialTab(): TabId {
  const hash = window.location.hash.slice(1)
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'table'
}

export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>(initialTab)
  const [prefill, setPrefill] = useState<{ pair: [number, number]; n: number } | null>(null)

  const refresh = useCallback(async () => {
    let s = await store.load()
    // Preview build only: start with the real history so there is something to look at.
    if (import.meta.env.VITE_DEMO_SEED === '1' && store.mode === 'local' && s.games.length === 0) {
      const { default: rows } = await import('./lib/demo-games.json')
      await store.importGames(rows as [string, string, number, number][])
      s = await store.load()
    }
    setSnapshot(s)
    setLoadError(null)
    return s
  }, [])

  useEffect(() => {
    refresh().catch((e: Error) => setLoadError(e.message))
    return store.subscribe(() => {
      refresh().catch((e: Error) => setLoadError(e.message))
    })
  }, [refresh])

  const select = (id: TabId) => {
    setTab(id)
    try {
      history.replaceState(null, '', `#${id}`)
    } catch {
      // some embedded viewers refuse URL changes; the tab still switches
    }
  }

  const data: Data | null = useMemo(() => {
    if (!snapshot) return null
    return {
      ...snapshot,
      ratings: currentRatings(snapshot.players, snapshot.games),
      byId: new Map(snapshot.players.map((p) => [p.id, p])),
      refresh,
    }
  }, [snapshot, refresh])

  return (
    <div className="app">
      <header className="top">
        <h1>Dice Throne Elo</h1>
        <span className="mode">
          {store.mode === 'local' ? 'Demo-Modus: nur auf diesem Gerät gespeichert' : `${snapshot?.games.length ?? '…'} Spiele`}
        </span>
      </header>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => select(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {loadError && <div className="card error">Laden fehlgeschlagen: {loadError}</div>}
      {!data && !loadError && <p className="muted">Lade…</p>}
      {data && tab === 'entry' && <EntryTab key={prefill?.n ?? 0} data={data} prefill={prefill?.pair} />}
      {data && tab === 'table' && <TableTab data={data} />}
      {data && tab === 'history' && <HistoryTab data={data} />}
      {data && tab === 'matchups' && (
        <MatchupTab
          data={data}
          onPlay={(a, b) => {
            setPrefill({ pair: [a, b], n: (prefill?.n ?? 0) + 1 })
            select('entry')
          }}
        />
      )}
      {data && tab !== 'entry' && (
        <button className="fab" aria-label="Neues Ergebnis eintragen" title="Neues Ergebnis eintragen" onClick={() => select('entry')}>
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
            <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  )
}
