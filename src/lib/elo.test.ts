import { describe, expect, it } from 'vitest'
import { eloDelta, expectedScore, marginMultiplier, replay, standings } from './elo'
import { bestPairing, scorePairs } from './matchups'

describe('elo formula', () => {
  it('even players, minimal win: ±20', () => {
    // expected 0.5, margin 1 → mult 1 + 0.35*(1/50)^2 ≈ 1.00014
    expect(eloDelta(1000, 1000, 10, 9)).toBe(20)
    expect(eloDelta(1000, 1000, 9, 10)).toBe(-20)
  })
  it('margin multiplier caps at 50 points', () => {
    expect(marginMultiplier(50, 0)).toBeCloseTo(1.35)
    expect(marginMultiplier(80, 0)).toBeCloseTo(1.35)
    expect(eloDelta(1000, 1000, 50, 0)).toBe(27) // 40*1.35*0.5 = 27
  })
  it('uses the 350 divisor', () => {
    expect(expectedScore(1350, 1000)).toBeCloseTo(10 / 11)
  })
  it('draw between unequal players moves the favourite down', () => {
    expect(eloDelta(1100, 1000, 20, 20)).toBeLessThan(0)
  })
  it('is zero-sum across a replay', () => {
    const players = [1, 2, 3].map((id) => ({ id, name: `P${id}` }))
    const games = [
      { id: 1, player_a_id: 1, player_b_id: 2, score_a: 30, score_b: 0, played_at: '' },
      { id: 2, player_a_id: 2, player_b_id: 3, score_a: 5, score_b: 12, played_at: '' },
      { id: 3, player_a_id: 3, player_b_id: 1, score_a: 7, score_b: 7, played_at: '' },
    ]
    const { ratings, games: out } = replay(players, games)
    expect([...ratings.values()].reduce((a, b) => a + b, 0)).toBe(3000)
    expect(out[1].elo_a_before).toBe(out[0].elo_b_after)
    const table = standings(players, out)
    expect(table.map((s) => s.games)).toEqual([2, 2, 2])
  })
})

describe('matchups', () => {
  it('prefers balanced, fresh pairs and pairs everyone', () => {
    const ratings = new Map([
      [1, 1100],
      [2, 1095],
      [3, 900],
      [4, 905],
      [5, 1000],
    ])
    const pairs = scorePairs([1, 2, 3, 4, 5], ratings, [])
    const best = bestPairing([1, 2, 3, 4, 5], pairs)
    expect(best.pairs).toHaveLength(2)
    const keys = best.pairs.map((p) => [p.a, p.b].sort().join('-')).sort()
    expect(keys).toEqual(['1-2', '3-4'])
    expect(best.sittingOut).toBe(5)
  })
  it('penalises frequent rematches', () => {
    const ratings = new Map([
      [1, 1000],
      [2, 1000],
      [3, 1010],
    ])
    const games = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1, player_a_id: 1, player_b_id: 2, score_a: 10, score_b: 10,
      elo_a_before: 1000, elo_b_before: 1000, elo_a_after: 1000, elo_b_after: 1000, played_at: '',
    }))
    const pairs = scorePairs([1, 2, 3], ratings, games)
    expect(pairs[0].headToHead).toBe(0)
  })
})
