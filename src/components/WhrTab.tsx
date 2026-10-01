import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../App'
import { computeWhr, DEFAULT_W2 } from '../lib/whr'
import { CALIBRATION_STEP, MIN_CALIBRATION_GAMES, type AutoCalibration, type Row } from '../lib/whrCalibration'
import CalibrationWorker from '../lib/whrWorker?worker&inline'

/** Calibrates w2 in a worker. Only reruns when the games that the calibration uses change. */
function useCalibration(data: Data): AutoCalibration | null {
  const rows = useMemo(() => {
    const name = (id: number) => data.byId.get(id)?.name ?? String(id)
    return [...data.games]
      .sort((a, b) => a.id - b.id)
      .map((g): Row => [name(g.player_a_id), name(g.player_b_id), g.score_a, g.score_b])
  }, [data.games, data.byId])
  const basedOn = Math.floor(rows.length / CALIBRATION_STEP) * CALIBRATION_STEP
  const key = JSON.stringify(rows.slice(0, basedOn))
  const [result, setResult] = useState<{ key: string; cal: AutoCalibration } | null>(null)

  useEffect(() => {
    const worker = new CalibrationWorker()
    worker.onmessage = (e: MessageEvent<AutoCalibration>) => setResult({ key, cal: e.data })
    worker.postMessage(JSON.parse(key))
    return () => worker.terminate()
  }, [key])

  return result?.key === key ? result.cal : null
}

export default function WhrTab({ data }: { data: Data }) {
  const [info, setInfo] = useState(false)
  const cal = useCalibration(data)
  const w2 = cal?.w2 ?? DEFAULT_W2
  // Recomputed from the complete history whenever any game is added, corrected or deleted.
  const rows = useMemo(() => computeWhr(data.players, data.games, w2), [data.players, data.games, w2])
  const nextAt = Math.max(MIN_CALIBRATION_GAMES + CALIBRATION_STEP, (Math.floor(data.games.length / CALIBRATION_STEP) + 1) * CALIBRATION_STEP)

  return (
    <section className="card">
      <div className="card-head">
        <h2>WHR-Tabelle</h2>
        <button className="info-btn" aria-expanded={info} aria-controls="whr-info" aria-label="Was ist WHR?" onClick={() => setInfo(!info)}>
          i
        </button>
      </div>
      {info && (
        <div id="whr-info" className="info-box small">
          <p>
            <strong>Whole-History Rating</strong> bewertet alle Spiele gemeinsam statt eins nach dem anderen. Nach jeder Partie wird die
            komplette Historie neu berechnet: Wenn dein früherer Gegner später stark spielt, zählt dein alter Sieg gegen ihn rückwirkend
            mehr.
          </p>
          <p>
            Gezählt wird nur Sieg, Niederlage oder Unentschieden, nicht die Punktedifferenz. Die Spielstärke darf sich mit der Zeit ändern.
            Wie stark, regelt w² (Drift pro Partie in der Runde). Das ± zeigt, wie sicher die Wertung ist: Wer wenig gespielt hat, hat ein
            großes ±.
          </p>
          <p>
            <strong>Automatische Kalibrierung:</strong> Alle {CALIBRATION_STEP} Partien sucht die App das w², mit dem WHR die Spiele am
            besten vorhergesagt hätte (jeder 10er-Block aus allen Spielen davor). Liegen mehrere Werte praktisch gleichauf, bleibt sie
            nah an {DEFAULT_W2}.
          </p>
          <CalibrationDetails cal={cal} nextAt={nextAt} />
          <p className="muted">Die Elo-Tabelle bleibt die offizielle Wertung. WHR ist eine zweite Sicht.</p>
        </div>
      )}
      <p className="small muted" style={{ marginTop: 0 }}>
        w² = {w2}
        {cal ? (cal.basedOn ? ` · kalibriert auf ${cal.basedOn} Spielen` : ' · Standardwert, noch zu wenige Spiele') : ' · kalibriere…'}
      </p>
      {!rows.length ? (
        <p className="muted">Noch keine Spieler.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Spieler</th>
              <th>WHR</th>
              <th title="Unsicherheit (eine Standardabweichung)">±</th>
              <th>Spiele</th>
              <th className="hide-narrow">Elo</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.player.id} className={r.rank === 1 ? 'top1' : undefined}>
                <td>{r.rank}</td>
                <td>{r.player.name}</td>
                <td className="elo">{r.games ? r.rating : '–'}</td>
                <td className="muted">{r.games ? r.uncertainty : ''}</td>
                <td>{r.games}</td>
                <td className="hide-narrow muted">{data.ratings.get(r.player.id) ?? 1000}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function CalibrationDetails({ cal, nextAt }: { cal: AutoCalibration | null; nextAt: number }) {
  if (!cal) return <p>Kalibrierung läuft…</p>
  if (!cal.report || !cal.basedOn) return <p>Die erste Kalibrierung läuft ab {MIN_CALIBRATION_GAMES + CALIBRATION_STEP} Spielen.</p>
  const results = cal.report.rolling
  const evaluated = results[0]?.evaluated ?? 0
  return (
    <>
      <p>
        Letzte Kalibrierung auf {cal.basedOn} Spielen ({evaluated} vorhergesagte Spiele), nächste bei {nextAt}.
        {evaluated < 100 && ' Bei so wenigen Spielen liegen die Kandidaten oft innerhalb des Zufalls.'}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>w²</th>
              <th>Log-Loss</th>
              <th>Treffer</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.w2} className={r.w2 === cal.w2 ? 'top1' : undefined}>
                <td>{r.w2}</td>
                <td>{r.logLoss.toFixed(3)}</td>
                <td>{Math.round(r.accuracy * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
