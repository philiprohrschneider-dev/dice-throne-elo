import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { replay, type Game, type GameInput, type Player } from './elo'

export interface Snapshot {
  players: Player[]
  games: Game[]
}

/** Historical format from games.json: [playerA, playerB, scoreA, scoreB]. */
export type ImportRow = [string, string, number, number]

export interface Store {
  mode: 'supabase' | 'local'
  load(): Promise<Snapshot>
  addPlayer(name: string): Promise<Player>
  addGame(g: GameInput): Promise<Game>
  updateGame(id: number, g: GameInput): Promise<void>
  deleteGame(id: number): Promise<void>
  importGames(rows: ImportRow[]): Promise<number>
  /** Calls back whenever someone else changes data. Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const store: Store = url && key ? supabaseStore(createClient(url, key)) : localStore()

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

function supabaseStore(db: SupabaseClient): Store {
  return {
    mode: 'supabase',
    async load() {
      const [players, games] = await Promise.all([
        db.from('players').select('id,name,created_at').order('id'),
        db.from('games').select('*').order('id'),
      ])
      return { players: check(players) as Player[], games: check(games) as Game[] }
    },
    async addPlayer(name) {
      return check(await db.rpc('add_player', { p_name: name })) as Player
    },
    async addGame(g) {
      return check(
        await db.rpc('add_game', { p_a: g.player_a_id, p_b: g.player_b_id, p_score_a: g.score_a, p_score_b: g.score_b }),
      ) as Game
    },
    async updateGame(id, g) {
      check(
        await db.rpc('update_game', {
          p_id: id, p_a: g.player_a_id, p_b: g.player_b_id, p_score_a: g.score_a, p_score_b: g.score_b,
        }),
      )
    },
    async deleteGame(id) {
      check(await db.rpc('delete_game', { p_id: id }))
    },
    async importGames(rows) {
      return check(await db.rpc('import_games', { p_games: rows })) as number
    },
    subscribe(onChange) {
      let timer: ReturnType<typeof setTimeout> | undefined
      const debounced = () => {
        clearTimeout(timer)
        timer = setTimeout(onChange, 300)
      }
      const channel = db
        .channel('elo-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, debounced)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, debounced)
        .subscribe()
      return () => {
        clearTimeout(timer)
        void db.removeChannel(channel)
      }
    },
  }
}

/** Browser-only fallback so the app works before Supabase is connected. Data stays on this device. */
function localStore(): Store {
  const KEY = 'elo-tracker-local-v1'
  const read = (): Snapshot => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return JSON.parse(raw) as Snapshot
    } catch {
      // ignore unreadable storage and start empty
    }
    return { players: [], games: [] }
  }
  const write = (s: Snapshot) => {
    const { games } = replay(s.players, s.games)
    const next = { players: s.players, games }
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // storage blocked: changes live only until reload
    }
    return next
  }
  let state = read()
  const nextId = (rows: { id: number }[]) => rows.reduce((m, r) => Math.max(m, r.id), 0) + 1
  const validate = (g: GameInput) => {
    if (g.player_a_id === g.player_b_id) throw new Error('Ein Spieler kann nicht gegen sich selbst spielen')
    if (![g.player_a_id, g.player_b_id].every((id) => state.players.some((p) => p.id === id))) throw new Error('Unbekannter Spieler')
    if (g.score_a < 0 || g.score_b < 0) throw new Error('Punkte dürfen nicht negativ sein')
  }
  const addPlayerSync = (name: string): Player => {
    const clean = name.trim()
    if (!clean) throw new Error('Name fehlt')
    const existing = state.players.find((p) => p.name.toLowerCase() === clean.toLowerCase())
    if (existing) throw new Error(`"${existing.name}" gibt es schon`)
    const p = { id: nextId(state.players), name: clean, created_at: new Date().toISOString() }
    state = write({ ...state, players: [...state.players, p] })
    return p
  }
  const addGameSync = (g: GameInput): Game => {
    validate(g)
    const id = nextId(state.games)
    const stub = { ...g, id, played_at: new Date().toISOString(), elo_a_before: 0, elo_b_before: 0, elo_a_after: 0, elo_b_after: 0 }
    state = write({ ...state, games: [...state.games, stub] })
    return state.games.find((x) => x.id === id)!
  }
  return {
    mode: 'local',
    async load() {
      return state
    },
    async addPlayer(name) {
      return addPlayerSync(name)
    },
    async addGame(g) {
      return addGameSync(g)
    },
    async updateGame(id, g) {
      validate(g)
      state = write({ ...state, games: state.games.map((x) => (x.id === id ? { ...x, ...g } : x)) })
    },
    async deleteGame(id) {
      state = write({ ...state, games: state.games.filter((x) => x.id !== id) })
    },
    async importGames(rows) {
      if (state.games.length) throw new Error('Es gibt schon Spiele, Import nur in eine leere Datenbank')
      const byName = new Map(state.players.map((p) => [p.name.toLowerCase(), p]))
      const players = [...state.players]
      const games: Game[] = []
      const idFor = (name: string) => {
        const k = name.trim().toLowerCase()
        let p = byName.get(k)
        if (!p) {
          p = { id: nextId(players), name: name.trim(), created_at: new Date().toISOString() }
          players.push(p)
          byName.set(k, p)
        }
        return p.id
      }
      const now = new Date().toISOString()
      rows.forEach(([a, b, sa, sb], i) => {
        games.push({
          id: i + 1, player_a_id: idFor(a), player_b_id: idFor(b), score_a: sa, score_b: sb, played_at: now,
          elo_a_before: 0, elo_b_before: 0, elo_a_after: 0, elo_b_after: 0,
        })
      })
      state = write({ players, games })
      return rows.length
    },
    subscribe(onChange) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === KEY) {
          state = read()
          onChange()
        }
      }
      window.addEventListener('storage', onStorage)
      return () => {
        window.removeEventListener('storage', onStorage)
      }
    },
  }
}

export function parseImport(text: string): ImportRow[] {
  const data: unknown = JSON.parse(text)
  const rows = Array.isArray(data) ? data : (data as { games?: unknown }).games
  if (!Array.isArray(rows)) throw new Error('Erwartet wird eine Liste [SpielerA, SpielerB, PunkteA, PunkteB]')
  return rows.map((r, i) => {
    if (!Array.isArray(r) || r.length < 4) throw new Error(`Eintrag ${i + 1} hat nicht das Format [A, B, PunkteA, PunkteB]`)
    const [a, b, sa, sb] = r
    if (typeof a !== 'string' || typeof b !== 'string' || !Number.isFinite(Number(sa)) || !Number.isFinite(Number(sb)))
      throw new Error(`Eintrag ${i + 1} ist ungültig: ${JSON.stringify(r)}`)
    return [a, b, Number(sa), Number(sb)] as ImportRow
  })
}
