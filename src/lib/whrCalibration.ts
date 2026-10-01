// Cross-validation for the WHR drift parameter w2. Used by scripts/calibrate-whr.ts.
import type { Game, Player } from './elo.ts'
import { currentWhrRatings } from './whr.ts'

/** [playerA, playerB, scoreA, scoreB], chronological (the games.json format). */
export type Row = [string, string, number, number]

export interface CandidateResult {
  w2: number
  /** Mean negative log-likelihood of the actual winner. */
  logLoss: number
  /** Share of games where the higher-rated player won (equal ratings count half). */
  accuracy: number
  /** Test games that could be scored. */
  evaluated: number
  /** Per-game log-loss, in test order, for paired comparisons. */
  losses: number[]
}

export interface CalibrationReport {
  totalGames: number
  trainGames: number
  testGames: number
  /** Test games left out because a player had no training game. */
  skippedNewPlayer: number
  /** Test games left out because they were draws (no winner to score). */
  skippedDraw: number
  /** Static split: train once on the first games, predict all test games. */
  split: CandidateResult[]
  /** Rolling check: each test game predicted from all games before it. */
  rolling: CandidateResult[]
}

export const DEFAULT_CANDIDATES = [50, 100, 150, 175, 200, 225, 250, 300, 500]

function toModel(rows: Row[]): { players: Player[]; games: Game[]; ids: Map<string, number> } {
  const ids = new Map<string, number>()
  const id = (name: string) => {
    const k = name.trim().toLowerCase()
    if (!ids.has(k)) ids.set(k, ids.size + 1)
    return ids.get(k)!
  }
  const games = rows.map(([a, b, sa, sb], i) => ({
    id: i + 1, player_a_id: id(a), player_b_id: id(b), score_a: sa, score_b: sb,
    elo_a_before: 0, elo_b_before: 0, elo_a_after: 0, elo_b_after: 0, played_at: '',
  }))
  const players = [...ids.values()].map((pid) => ({ id: pid, name: String(pid) }))
  return { players, games, ids }
}

/** Probability that A beats B on the WHR (Elo-400) scale. */
const winProb = (ra: number, rb: number) => 1 / (1 + Math.pow(10, (rb - ra) / 400))

function score(ratings: Map<number, number>, g: Game): { loss: number; hit: number } | 'new' | 'draw' {
  const ra = ratings.get(g.player_a_id)
  const rb = ratings.get(g.player_b_id)
  if (ra === undefined || rb === undefined) return 'new'
  if (g.score_a === g.score_b) return 'draw'
  const pA = winProb(ra, rb)
  const pWinner = g.score_a > g.score_b ? pA : 1 - pA
  return { loss: -Math.log(pWinner), hit: pWinner > 0.5 ? 1 : pWinner === 0.5 ? 0.5 : 0 }
}

function summarize(w2: number, scored: { loss: number; hit: number }[]): CandidateResult {
  const n = scored.length
  return {
    w2,
    logLoss: n ? scored.reduce((s, x) => s + x.loss, 0) / n : NaN,
    accuracy: n ? scored.reduce((s, x) => s + x.hit, 0) / n : NaN,
    evaluated: n,
    losses: scored.map((x) => x.loss),
  }
}

export function calibrate(rows: Row[], candidates = DEFAULT_CANDIDATES, testFraction = 0.15, testCount?: number): CalibrationReport {
  const { players, games } = toModel(rows)
  const nTest = testCount ?? Math.round(rows.length * testFraction)
  const nTrain = rows.length - nTest
  const train = games.slice(0, nTrain)
  const test = games.slice(nTrain)

  let skippedNewPlayer = 0
  let skippedDraw = 0
  const split = candidates.map((w2, ci) => {
    const ratings = currentWhrRatings(players, train, w2)
    const scored: { loss: number; hit: number }[] = []
    for (const g of test) {
      const r = score(ratings, g)
      if (r === 'new') {
        if (ci === 0) skippedNewPlayer++
      } else if (r === 'draw') {
        if (ci === 0) skippedDraw++
      } else scored.push(r)
    }
    return summarize(w2, scored)
  })

  // Rolling origin: for test game i, fit on every game before it. A player who first
  // appears in the test period becomes scoreable once they have one earlier game.
  const rolling = candidates.map((w2) => {
    const scored: { loss: number; hit: number }[] = []
    test.forEach((g, i) => {
      const ratings = currentWhrRatings(players, games.slice(0, nTrain + i), w2)
      const r = score(ratings, g)
      if (typeof r === 'object') scored.push(r)
    })
    return summarize(w2, scored)
  })

  return { totalGames: rows.length, trainGames: nTrain, testGames: nTest, skippedNewPlayer, skippedDraw, split, rolling }
}

/**
 * Paired bootstrap: how often (share of resamples) candidate `a` has a lower mean
 * log-loss than candidate `b` on the same resampled test games. Deterministic seed.
 */
export function bootstrapWinShare(a: number[], b: number[], resamples = 5000, seed = 42): number {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const n = a.length
  if (!n) return NaN
  let wins = 0
  for (let r = 0; r < resamples; r++) {
    let diff = 0
    for (let i = 0; i < n; i++) {
      const k = Math.floor(rnd() * n)
      diff += a[k] - b[k]
    }
    if (diff < 0) wins++
    else if (diff === 0) wins += 0.5
  }
  return wins / resamples
}
