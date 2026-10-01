# Dice Throne Elo

Web app for our group to track Dice Throne duels with Elo. Everyone uses the same link,
enters results, and sees the table update live.

## Rating formula (fixed)

Start 1000, K = 40, no provisional K, no decay, zero-sum.

```
expectedA        = 1 / (1 + 10^((eloB - eloA) / 350))
marginRatio      = min(|scoreA - scoreB|, 50) / 50
marginMultiplier = 1 + 0.35 * marginRatio²
deltaA           = round(40 * marginMultiplier * (actualA - expectedA))   // actualA: 1 / 0.5 / 0
deltaB           = -deltaA
```

It lives twice and both must stay identical: `src/lib/elo.ts` (preview, demo mode) and
`elo_delta()` in `supabase/schema.sql` (what gets saved). `npm run check:sql` proves they agree.

## Features

- **Eintragen**: pick two players (or create one inline), enter scores, see win chance and Elo change
  before saving, then the new ratings and rank change.
- **Tabelle**: by Elo, with games, W/L/D and form (Elo change over the last 5 games).
- **Verlauf**: all games with Elo change per player, filter by player. "Korrigieren" edits or deletes
  any past game; every later game is recomputed.
- **Matchups**: tick who is present; suggests a full round of pairings that balances win chance
  against variety (rare/old pairings, and "Brücke" games between players with no common opponent,
  which keep the zero-sum pool comparable).
- **Import/Export**: load the historical `games.json` (`[[A, B, scoreA, scoreB], …]`, chronological)
  into an empty database; export the current history in the same format as a backup.

## Setup

1. Create a Supabase project. In the SQL editor, run `supabase/schema.sql` once.
2. `cp .env.example .env` and fill in the project URL and anon key.
3. `npm install && npm run dev`
4. Open the app → Verlauf → "Daten importieren" → choose `games.json`.

Without `.env` the app runs in demo mode and stores everything in the browser only.

### Deploy

Any static host works (Vercel, Netlify, Cloudflare Pages): build command `npm run build`,
output `dist`, and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as environment variables.

### Security model

No login: anyone with the link can read, add, correct and delete games, which is the point for a
friend group. The tables are read-only for the public key; all writes go through SQL functions that
take a lock, so two people saving at the same moment never compute from stale ratings.

## WHR tab and calibrating w2

The WHR tab shows a Whole-History Rating next to Elo (Elo stays the official rating). It is
recomputed from all games on every change. Time unit = game index (one game in the group = one
step), because the historical games have no dates. `DEFAULT_W2` in `src/lib/whr.ts` is the drift
variance per step in Elo² (same unit as the Python package whole-history-rating).

To recalibrate once more games exist: export games.json on the site (Verlauf → "Daten importieren /
sichern"), then

```
npm run calibrate:whr -- games.json                 # default candidates, last 15 % as test
npm run calibrate:whr -- games.json --test 18 --w2 100,200,300
```

It prints log-loss, hit rate and the number of scoreable test games for a fixed chronological split
and for a rolling one-step-ahead check, plus a paired bootstrap against the best value.

## Checks

```
npm test            # formula + matchup unit tests
npm run check:sql   # runs schema.sql in an in-memory Postgres and compares with the JS formula
npm run check:sql -- games.json
```
