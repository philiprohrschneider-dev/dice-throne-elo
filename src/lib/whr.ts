// Whole-History Rating (Rémi Coulom, 2008), shown as a second table next to the Elo one.
// Every player's rating is a curve over time, fitted to ALL games at once, so later
// results also correct earlier estimates. It ignores score margins (win/loss/draw only).
//
// Time axis: the historical games have no real dates, so one game in the group = one
// time step. A player's rating may drift by about W_ELO per sqrt(time step).
import type { Game, Player } from './elo'

const LN10_400 = Math.log(10) / 400
/** Allowed drift per game in the group, in Elo points (Wiener process). */
export const W_ELO = 10
const W2 = (W_ELO * LN10_400) ** 2
/** Displayed scale: same centre as our Elo table. */
const CENTER = 1000

interface DayGame {
  opponent: PlayerState
  score: number // 1 win, 0 loss, 0.5 draw
  oppDay: number // index into opponent.days
}

interface Day {
  time: number
  r: number // natural rating (ln gamma)
  games: DayGame[]
}

interface PlayerState {
  id: number
  days: Day[]
}

export interface WhrRow {
  player: Player
  rating: number
  /** One standard deviation of the current rating, in rating points. */
  uncertainty: number
  games: number
  rank: number
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x))

function buildStates(players: Player[], games: Game[]): PlayerState[] {
  const states = new Map<number, PlayerState>(players.map((p) => [p.id, { id: p.id, days: [] }]))
  const ordered = [...games].sort((a, b) => a.id - b.id)
  ordered.forEach((g, t) => {
    const a = states.get(g.player_a_id)
    const b = states.get(g.player_b_id)
    if (!a || !b) return
    const sa = g.score_a > g.score_b ? 1 : g.score_a < g.score_b ? 0 : 0.5
    const da: Day = { time: t, r: 0, games: [] }
    const db: Day = { time: t, r: 0, games: [] }
    a.days.push(da)
    b.days.push(db)
    da.games.push({ opponent: b, score: sa, oppDay: b.days.length - 1 })
    db.games.push({ opponent: a, score: 1 - sa, oppDay: a.days.length - 1 })
  })
  return [...states.values()]
}

/** Gradient and tridiagonal Hessian of the log-posterior for one player. */
function derivatives(p: PlayerState) {
  const n = p.days.length
  const grad = new Array<number>(n).fill(0)
  const diag = new Array<number>(n).fill(0)
  const off = new Array<number>(Math.max(0, n - 1)).fill(0)
  p.days.forEach((d, k) => {
    for (const g of d.games) {
      const prob = sigmoid(d.r - g.opponent.days[g.oppDay].r)
      grad[k] += g.score - prob
      diag[k] -= prob * (1 - prob)
    }
  })
  // Prior: one virtual win and one virtual loss against a centre-rated player on the
  // first day, which keeps ratings of players with few games near the centre.
  const p0 = sigmoid(p.days[0].r)
  grad[0] += 1 - 2 * p0
  diag[0] -= 2 * p0 * (1 - p0)
  // Wiener process between consecutive days.
  for (let k = 0; k < n - 1; k++) {
    const s2 = Math.max(1, p.days[k + 1].time - p.days[k].time) * W2
    const diff = p.days[k + 1].r - p.days[k].r
    grad[k] += diff / s2
    grad[k + 1] -= diff / s2
    diag[k] -= 1 / s2
    diag[k + 1] -= 1 / s2
    off[k] = 1 / s2
  }
  return { grad, diag, off }
}

/** Solves the symmetric tridiagonal system (diag, off) x = rhs (Thomas algorithm). */
function solveTridiagonal(diag: number[], off: number[], rhs: number[]): number[] {
  const n = diag.length
  const c = new Array<number>(n).fill(0)
  const d = new Array<number>(n).fill(0)
  c[0] = n > 1 ? off[0] / diag[0] : 0
  d[0] = rhs[0] / diag[0]
  for (let i = 1; i < n; i++) {
    const m = diag[i] - off[i - 1] * c[i - 1]
    c[i] = i < n - 1 ? off[i] / m : 0
    d[i] = (rhs[i] - off[i - 1] * d[i - 1]) / m
  }
  const x = new Array<number>(n).fill(0)
  x[n - 1] = d[n - 1]
  for (let i = n - 2; i >= 0; i--) x[i] = d[i] - c[i] * x[i + 1]
  return x
}

function newtonStep(p: PlayerState): number {
  if (!p.days.length) return 0
  const { grad, diag, off } = derivatives(p)
  const step = solveTridiagonal(diag, off, grad)
  let maxChange = 0
  p.days.forEach((d, k) => {
    d.r -= step[k]
    maxChange = Math.max(maxChange, Math.abs(step[k]))
  })
  return maxChange
}

export function computeWhr(players: Player[], games: Game[], maxIterations = 200): WhrRow[] {
  const states = buildStates(players, games)
  for (let it = 0; it < maxIterations; it++) {
    let change = 0
    for (const p of states) change = Math.max(change, newtonStep(p))
    if (change < 1e-6) break
  }
  const byId = new Map(players.map((p) => [p.id, p]))
  const rows = states.map((s): WhrRow => {
    const last = s.days[s.days.length - 1]
    let uncertainty = 350 // shown for players without games
    if (last) {
      // Variance of the last day = -(H^-1)[n-1][n-1].
      const { diag, off } = derivatives(s)
      const e = new Array<number>(s.days.length).fill(0)
      e[e.length - 1] = 1
      const col = solveTridiagonal(diag, off, e)
      uncertainty = Math.sqrt(Math.max(0, -col[col.length - 1])) / LN10_400
    }
    return {
      player: byId.get(s.id)!,
      rating: Math.round((last?.r ?? 0) / LN10_400 + CENTER),
      uncertainty: Math.round(uncertainty),
      games: s.days.length,
      rank: 0,
    }
  })
  rows.sort((a, b) => b.rating - a.rating || a.player.name.localeCompare(b.player.name))
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].rating === r.rating ? rows[i - 1].rank : i + 1
  })
  return rows
}
