// Elo formula as agreed by the group. Do not change without asking everyone:
// historical ratings are derived from exactly these constants.
export const START_ELO = 1000
export const K = 40
export const DIVISOR = 350
export const MARGIN_CAP = 50
export const MARGIN_WEIGHT = 0.35

export function expectedScore(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / DIVISOR))
}

export function actualScore(scoreA: number, scoreB: number): number {
  if (scoreA > scoreB) return 1
  if (scoreA < scoreB) return 0
  return 0.5
}

export function marginMultiplier(scoreA: number, scoreB: number): number {
  const ratio = Math.min(Math.abs(scoreA - scoreB), MARGIN_CAP) / MARGIN_CAP
  return 1 + MARGIN_WEIGHT * ratio * ratio
}

/** Elo change for player A. Player B gets exactly the negative (zero-sum). */
export function eloDelta(eloA: number, eloB: number, scoreA: number, scoreB: number): number {
  const raw = K * marginMultiplier(scoreA, scoreB) * (actualScore(scoreA, scoreB) - expectedScore(eloA, eloB))
  // Math.round == floor(x + 0.5); the SQL function uses the same rule so both agree.
  return Math.round(raw) || 0
}

export interface Player {
  id: number
  name: string
  created_at?: string
}

export interface Character {
  id: number
  name: string
}

export interface GameInput {
  player_a_id: number
  player_b_id: number
  score_a: number
  score_b: number
  /** Dice Throne hero each player used; optional (older games have none). */
  character_a_id?: number | null
  character_b_id?: number | null
}

export interface Game extends GameInput {
  id: number
  elo_a_before: number
  elo_b_before: number
  elo_a_after: number
  elo_b_after: number
  played_at: string
}

/**
 * Replays games in id order and returns them with fresh before/after values,
 * plus the final rating of every player.
 */
export function replay(
  players: Player[],
  games: Omit<Game, 'elo_a_before' | 'elo_b_before' | 'elo_a_after' | 'elo_b_after'>[],
): { games: Game[]; ratings: Map<number, number> } {
  const ratings = new Map<number, number>(players.map((p) => [p.id, START_ELO]))
  const out: Game[] = []
  for (const g of [...games].sort((x, y) => x.id - y.id)) {
    const a = ratings.get(g.player_a_id) ?? START_ELO
    const b = ratings.get(g.player_b_id) ?? START_ELO
    const d = eloDelta(a, b, g.score_a, g.score_b)
    ratings.set(g.player_a_id, a + d)
    ratings.set(g.player_b_id, b - d)
    out.push({ ...g, elo_a_before: a, elo_b_before: b, elo_a_after: a + d, elo_b_after: b - d })
  }
  return { games: out, ratings }
}

export interface Standing {
  player: Player
  elo: number
  games: number
  wins: number
  losses: number
  draws: number
  rank: number
}

/** Current ratings, read from each player's most recent game (stored after-values). */
export function currentRatings(players: Player[], games: Game[]): Map<number, number> {
  const ratings = new Map<number, number>(players.map((p) => [p.id, START_ELO]))
  for (const g of [...games].sort((x, y) => x.id - y.id)) {
    ratings.set(g.player_a_id, g.elo_a_after)
    ratings.set(g.player_b_id, g.elo_b_after)
  }
  return ratings
}

export function standings(players: Player[], games: Game[], ratings = currentRatings(players, games)): Standing[] {
  const rows = new Map<number, Standing>(
    players.map((p) => [p.id, { player: p, elo: ratings.get(p.id) ?? START_ELO, games: 0, wins: 0, losses: 0, draws: 0, rank: 0 }]),
  )
  for (const g of games) {
    const a = rows.get(g.player_a_id)
    const b = rows.get(g.player_b_id)
    if (!a || !b) continue
    a.games++
    b.games++
    if (g.score_a > g.score_b) {
      a.wins++
      b.losses++
    } else if (g.score_a < g.score_b) {
      b.wins++
      a.losses++
    } else {
      a.draws++
      b.draws++
    }
  }
  const sorted = [...rows.values()].sort((x, y) => y.elo - x.elo || x.player.name.localeCompare(y.player.name))
  // Equal Elo shares a rank (1, 2, 2, 4).
  sorted.forEach((s, i) => {
    s.rank = i > 0 && sorted[i - 1].elo === s.elo ? sorted[i - 1].rank : i + 1
  })
  return sorted
}

export function rankOf(ratings: Map<number, number>, playerId: number): number {
  const mine = ratings.get(playerId) ?? START_ELO
  let better = 0
  for (const [id, elo] of ratings) if (id !== playerId && elo > mine) better++
  return better + 1
}

/** Ratings as they were right before game `gameId` (exclusive). */
export function ratingsBefore(players: Player[], games: Game[], gameId: number): Map<number, number> {
  return currentRatings(
    players,
    games.filter((g) => g.id < gameId),
  )
}
