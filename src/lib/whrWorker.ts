// Runs the w2 calibration off the main thread so the page stays responsive.
import { autoCalibrate, type Row } from './whrCalibration.ts'

self.onmessage = (e: MessageEvent<Row[]>) => {
  const result = autoCalibrate(e.data)
  // Per-game losses are only needed for the script's bootstrap; keep the message small.
  if (result.report) {
    for (const r of [...result.report.split, ...result.report.rolling]) r.losses = []
  }
  self.postMessage(result)
}
