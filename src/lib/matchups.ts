import { expectedScore, START_ELO, type Game } from './elo'

export interface PairInfo {
  a: number
  b: number
  winChanceA: number
  headToHead: number
  /** Games since these two last met; Infinity if never. */
  gamesSinceLastMeeting: number
  /** True when the two have no common opponent and never met: a "bridge" between subgroups. */
  bridge: boolean
  balanceCost: number
  varietyCost: number
  cost: number
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)

/**
 * Scores every pair of the given players. Lower cost = better suggestion.
 * balance: 0 for a 50/50 game, 1 from about 67/33 onwards.
 * variety: 0 for a first meeting, approaching 1 for frequent and recent repeats.
 * weight (0..1) is how much balance counts vs. variety.
 */
export function scorePairs(playerIds: number[], ratings: Map<number, number>, games: Game[], weight = 0.5): PairInfo[] {
  const ordered = [...games].sort((x, y) => x.id - y.id)
  const h2h = new Map<string, number>()
  const lastIndex = new Map<string, number>()
  const opponents = new Map<number, Set<number>>()
  ordered.forEach((g, i) => {
    const k = pairKey(g.player_a_id, g.player_b_id)
    h2h.set(k, (h2h.get(k) ?? 0) + 1)
    lastIndex.set(k, i)
    if (!opponents.has(g.player_a_id)) opponents.set(g.player_a_id, new Set())
    if (!opponents.has(g.player_b_id)) opponents.set(g.player_b_id, new Set())
    opponents.get(g.player_a_id)!.add(g.player_b_id)
    opponents.get(g.player_b_id)!.add(g.player_a_id)
  })

  const pairs: PairInfo[] = []
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      const a = playerIds[i]
      const b = playerIds[j]
      const k = pairKey(a, b)
      const count = h2h.get(k) ?? 0
      const since = lastIndex.has(k) ? ordered.length - 1 - lastIndex.get(k)! : Infinity
      const oa = opponents.get(a) ?? new Set<number>()
      const ob = opponents.get(b) ?? new Set<number>()
      const common = [...oa].some((x) => ob.has(x))
      const bridge = count === 0 && !common && oa.size > 0 && ob.size > 0

      const p = expectedScore(ratings.get(a) ?? START_ELO, ratings.get(b) ?? START_ELO)
      // 50/50 → 0, 67/33 or worse → 1, so lopsided games are not chosen just for being new.
      const balanceCost = Math.min(1, Math.abs(p - 0.5) * 6)
      // Repeats saturate (1 - e^(-n/3)); a very recent rematch adds extra on top.
      const repeat = 1 - Math.exp(-count / 3)
      const recency = since < 5 ? 0.5 : since < 15 ? 0.25 : 0
      const varietyCost = Math.min(1, repeat * 0.75 + recency) * (bridge ? 0.5 : 1)
      const cost = weight * balanceCost + (1 - weight) * varietyCost - (bridge ? 0.1 : 0)
      pairs.push({ a, b, winChanceA: p, headToHead: count, gamesSinceLastMeeting: since, bridge, balanceCost, varietyCost, cost })
    }
  }
  return pairs.sort((x, y) => x.cost - y.cost)
}

/**
 * Best way to split the group into duels (minimum total cost). With an odd
 * number of players, one sits out. Exact bitmask DP, fine up to ~20 players.
 */
export function bestPairing(playerIds: number[], pairs: PairInfo[]): { pairs: PairInfo[]; sittingOut: number | null } {
  const n = playerIds.length
  if (n < 2) return { pairs: [], sittingOut: playerIds[0] ?? null }
  if (n > 20) throw new Error('Zu viele Spieler für die Paarungs-Berechnung (max. 20)')
  const idx = new Map(playerIds.map((id, i) => [id, i]))
  const cost: number[][] = Array.from({ length: n }, () => new Array(n).fill(Infinity))
  const info: (PairInfo | undefined)[][] = Array.from({ length: n }, () => new Array(n))
  for (const p of pairs) {
    const i = idx.get(p.a)
    const j = idx.get(p.b)
    if (i === undefined || j === undefined) continue
    cost[i][j] = cost[j][i] = p.cost
    info[i][j] = info[j][i] = p
  }

  const full = (1 << n) - 1
  const memo = new Map<number, { c: number; choice: [number, number] | [number] | null }>()
  const odd = n % 2 === 1
  // State: mask of players already handled. With odd n, exactly one player may be skipped.
  const solve = (mask: number, skipped: boolean): number => {
    if (mask === full) return 0
    const key = mask * 2 + (skipped ? 1 : 0)
    const hit = memo.get(key)
    if (hit) return hit.c
    let i = 0
    while (mask & (1 << i)) i++
    let best = Infinity
    let choice: [number, number] | [number] | null = null
    for (let j = i + 1; j < n; j++) {
      if (mask & (1 << j)) continue
      const c = cost[i][j] + solve(mask | (1 << i) | (1 << j), skipped)
      if (c < best) {
        best = c
        choice = [i, j]
      }
    }
    if (odd && !skipped) {
      // Skipping is free: whoever fits worst into the pairing sits out.
      const c = solve(mask | (1 << i), true)
      if (c < best) {
        best = c
        choice = [i]
      }
    }
    memo.set(key, { c: best, choice })
    return best
  }
  solve(0, false)

  const result: PairInfo[] = []
  let sittingOut: number | null = null
  let mask = 0
  let skipped = false
  while (mask !== full) {
    const step = memo.get(mask * 2 + (skipped ? 1 : 0))!.choice!
    if (step.length === 2) {
      result.push(info[step[0]][step[1]]!)
      mask |= (1 << step[0]) | (1 << step[1])
    } else {
      sittingOut = playerIds[step[0]]
      mask |= 1 << step[0]
      skipped = true
    }
  }
  return { pairs: result, sittingOut }
}
