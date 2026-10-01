import { describe, expect, it } from 'vitest'
import type { Game } from './elo'
import { computeWhr } from './whr'

const players = [1, 2, 3].map((id) => ({ id, name: `P${id}` }))
let nextId = 1
const game = (a: number, b: number, sa: number, sb: number): Game => ({
  id: nextId++, player_a_id: a, player_b_id: b, score_a: sa, score_b: sb,
  elo_a_before: 0, elo_b_before: 0, elo_a_after: 0, elo_b_after: 0, played_at: '',
})

describe('whr', () => {
  it('is symmetric for an even record', () => {
    const rows = computeWhr(players.slice(0, 2), [game(1, 2, 5, 0), game(2, 1, 5, 0)])
    expect(rows[0].rating).toBe(rows[1].rating)
    expect(rows[0].rating).toBe(1000)
  })
  it('ranks the stronger player first and stays centred', () => {
    const g = [game(1, 2, 9, 0), game(1, 3, 9, 0), game(2, 3, 9, 0), game(1, 2, 9, 0), game(2, 3, 9, 0)]
    const rows = computeWhr(players, g)
    expect(rows.map((r) => r.player.id)).toEqual([1, 2, 3])
    expect(rows[0].rating).toBeGreaterThan(1000)
    expect(rows[2].rating).toBeLessThan(1000)
    expect(rows.every((r) => r.uncertainty > 0)).toBe(true)
  })
  it('a later result changes the whole history (recomputed from all games)', () => {
    const base = [game(1, 2, 9, 0), game(1, 3, 9, 0)]
    const before = computeWhr(players, base).find((r) => r.player.id === 3)!.rating
    // Player 2 now beats player 1 twice: 1 looks weaker in hindsight, so 3's old loss to 1 now counts as worse.
    const after = computeWhr(players, [...base, game(2, 1, 9, 0), game(2, 1, 9, 0)]).find((r) => r.player.id === 3)!.rating
    expect(after).toBeLessThan(before)
  })
})

describe('whr calibration', () => {
  it('reports every candidate on the same scoreable test games', async () => {
    const { calibrate } = await import('./whrCalibration')
    const names = ['A', 'B', 'C', 'D']
    const rows = Array.from({ length: 40 }, (_, i) => [names[i % 4], names[(i + 1 + (i % 3)) % 4], (i * 7) % 11, (i * 5) % 9] as [string, string, number, number])
      .filter(([a, b]) => a !== b)
    const report = calibrate(rows, [50, 200])
    expect(report.trainGames + report.testGames).toBe(rows.length)
    expect(report.split[0].evaluated).toBe(report.split[1].evaluated)
    expect(report.split[0].evaluated).toBe(report.testGames - report.skippedNewPlayer - report.skippedDraw)
    for (const r of [...report.split, ...report.rolling]) {
      expect(r.logLoss).toBeGreaterThan(0)
      expect(r.accuracy).toBeGreaterThanOrEqual(0)
    }
  })
})
