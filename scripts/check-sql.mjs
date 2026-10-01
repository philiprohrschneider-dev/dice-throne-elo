// Runs supabase/schema.sql in an in-memory Postgres (PGlite) and checks that the
// SQL functions produce exactly the same ratings as the JS formula.
// Usage: node scripts/check-sql.mjs [games.json]
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const K = 40
const delta = (a, b, sa, sb) => {
  const exp = 1 / (1 + Math.pow(10, (b - a) / 350))
  const act = sa > sb ? 1 : sa < sb ? 0 : 0.5
  const r = Math.min(Math.abs(sa - sb), 50) / 50
  return Math.round(K * (1 + 0.35 * r * r) * (act - exp)) || 0
}

const file = process.argv[2]
let rows
if (file) rows = JSON.parse(readFileSync(file, 'utf8'))
else {
  // Random but reproducible history.
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const names = ['Lars', 'Michelle', 'Yannik', 'Jini', 'Tom', 'David', 'Viola', 'Philip']
  rows = Array.from({ length: 400 }, () => {
    const a = Math.floor(rnd() * names.length)
    let b = Math.floor(rnd() * (names.length - 1))
    if (b >= a) b++
    const sa = Math.floor(rnd() * 60)
    const sb = rnd() < 0.05 ? sa : Math.floor(rnd() * 60)
    return [names[a], names[b], sa, sb]
  })
}

const db = new PGlite()
// Supabase-only bits that plain Postgres lacks.
await db.exec(`create role anon; create role authenticated; create publication supabase_realtime;`)
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'))
await db.query('select import_games($1::jsonb)', [JSON.stringify(rows)])

const js = new Map()
for (const [a, b, sa, sb] of rows) {
  const ea = js.get(a) ?? 1000
  const eb = js.get(b) ?? 1000
  const d = delta(ea, eb, sa, sb)
  js.set(a, ea + d)
  js.set(b, eb - d)
}
const check = async (label) => {
  const { rows: sql } = await db.query('select name, elo from players order by elo desc')
  const bad = sql.filter((r) => js.get(r.name) !== r.elo)
  console.log(label, bad.length ? `MISMATCH ${JSON.stringify(bad)}` : 'ok', sql.map((r) => `${r.name} ${r.elo}`).join(', '))
  if (bad.length) process.exitCode = 1
}
await check(`import of ${rows.length} games:`)

// Correction: change game 3, then delete game 5, and compare with a JS replay.
const { rows: ids } = await db.query('select id, player_a_id, player_b_id from games order by id')
await db.query('select update_game($1, $3, $2, 50, 0)', [ids[2].id, ids[2].player_a_id, ids[2].player_b_id])
await db.query('select delete_game($1)', [ids[4].id])
rows[2] = [rows[2][1], rows[2][0], 50, 0]
rows.splice(4, 1)
js.clear()
for (const [a, b, sa, sb] of rows) {
  const ea = js.get(a) ?? 1000
  const eb = js.get(b) ?? 1000
  const d = delta(ea, eb, sa, sb)
  js.set(a, ea + d)
  js.set(b, eb - d)
}
await check('after correction + delete:')
// Final ratings can converge again over a long history, so compare every game too.
const { rows: sqlGames } = await db.query('select elo_a_after, elo_b_after from games order by id')
const jsGames = []
{
  const m = new Map()
  for (const [a, b, sa, sb] of rows) {
    const ea = m.get(a) ?? 1000
    const eb = m.get(b) ?? 1000
    const d = delta(ea, eb, sa, sb)
    m.set(a, ea + d)
    m.set(b, eb - d)
    jsGames.push([ea + d, eb - d])
  }
}
const diff = sqlGames.filter((g, i) => g.elo_a_after !== jsGames[i][0] || g.elo_b_after !== jsGames[i][1]).length
console.log('per-game after-values vs JS:', diff ? `${diff} MISMATCHES` : `all ${sqlGames.length} match`)
if (diff) process.exitCode = 1
const { rows: chain } = await db.query(`
  select count(*)::int as broken from games g
  join lateral (select * from games p where p.id < g.id and (p.player_a_id = g.player_a_id or p.player_b_id = g.player_a_id) order by p.id desc limit 1) prev on true
  where g.elo_a_before <> case when prev.player_a_id = g.player_a_id then prev.elo_a_after else prev.elo_b_after end`)
console.log('before/after chain breaks:', chain[0].broken)
const { rows: sum } = await db.query('select sum(elo)::int s, count(*)::int n from players')
console.log('zero-sum:', sum[0].s === sum[0].n * 1000 ? 'ok' : 'BROKEN')
try {
  await db.query('select import_games($1::jsonb)', [JSON.stringify(rows.slice(0, 1))])
  console.log('second import: WRONGLY ALLOWED')
} catch (e) {
  console.log('second import refused:', e.message)
}
