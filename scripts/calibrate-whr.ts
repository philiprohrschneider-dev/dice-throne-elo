// Calibrates the WHR drift variance w2 by chronological cross-validation.
//
//   npm run calibrate:whr -- games.json [--test 18] [--w2 50,100,200]
//
// games.json is the app's export format ([[A, B, scoreA, scoreB], ...], chronological);
// on the live site: Verlauf → "Daten importieren / sichern" → "Als games.json exportieren".
// The app itself recalibrates automatically every 10 games (autoCalibrate); this script shows
// the details and lets you try other splits or candidates.
import { readFileSync } from 'node:fs'
import { autoCalibrate, bootstrapWinShare, calibrate, DEFAULT_CANDIDATES, type CandidateResult, type Row } from '../src/lib/whrCalibration.ts'

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith('--')) ?? 'games.json'
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const candidates = opt('w2')?.split(',').map(Number) ?? DEFAULT_CANDIDATES
const testCount = opt('test') ? Number(opt('test')) : undefined

const rows = JSON.parse(readFileSync(file, 'utf8')) as Row[]
const report = calibrate(rows, candidates, 0.15, testCount)

const fmt = (x: number, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '–')
function table(title: string, results: CandidateResult[]) {
  const best = results.reduce((m, r) => (r.logLoss < m.logLoss ? r : m))
  console.log(`\n${title}`)
  console.log('   w2   log-loss   treffer   n    P(besser als bester)')
  for (const r of results) {
    const share = r === best ? '  (bester)' : `  ${fmt(bootstrapWinShare(r.losses, best.losses) * 100, 0)} %`
    console.log(
      `${String(r.w2).padStart(5)}   ${fmt(r.logLoss)}     ${fmt(r.accuracy * 100, 0).padStart(3)} %    ${String(r.evaluated).padStart(2)}  ${share}`,
    )
  }
  return best
}

console.log(`${report.totalGames} Spiele: ${report.trainGames} Training, ${report.testGames} Test (chronologisch, letzte Spiele = Test).`)
console.log(`Nicht auswertbar: ${report.skippedNewPlayer} mit neuem Spieler, ${report.skippedDraw} Unentschieden.`)
const best = table('Fester Split (Training nur auf den ersten Spielen):', report.split)
const bestRolling = table('Rollierend (5 Blöcke, jeder aus allen Spielen davor vorhergesagt):', report.rolling)
console.log(`\nNiedrigster Log-Loss: w2 = ${best.w2} (fester Split), w2 = ${bestRolling.w2} (rollierend).`)
console.log('"P(besser als bester)": Anteil der Bootstrap-Stichproben, in denen dieser Wert gewinnt. Werte um 30-50 % heißen: nicht unterscheidbar.')

const auto = autoCalibrate(rows)
console.log(
  auto.basedOn
    ? `\nDie App nutzt gerade w2 = ${auto.w2} (automatisch, auf den ersten ${auto.basedOn} Spielen, jeder 10er-Block aus allen Spielen davor vorhergesagt).`
    : `\nDie App nutzt den Standardwert w2 = ${auto.w2} (noch zu wenige Spiele für die automatische Kalibrierung).`,
)
