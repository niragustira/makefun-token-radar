# Token Launch Radar

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/niragustira/makefun-token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/niragustira/makefun-token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [make.fun](https://make.fun/bounty/token-radar-01): it ranks
pre-token protocols from a sealed DefiLlama snapshot (14 Nov 2026, 758 protocols)
by implied value, so you can see which protocols without a token yet look most
valuable if they ever launch one.

## How it works

Each rankable protocol gets an implied value:

- `implied = TVL x category multiple x growth x maturity x chain`
- The category multiple is the median market-cap/TVL of live-token protocols in
  the same category (global median as fallback), clamped to 0.05x-2.5x.
- Growth, maturity (protocol age), and chain count adjust the result.
- Only protocols that record no token (no CoinGecko id and no symbol) and pass
  the full watchlist rules are ranked. The board holds 178 rows: the 40
  watchlist protocols plus 138 early ones under the floor.

The static dashboard in `dashboard/` (no network calls) lets you search, filter
by category and chain, sort every column, and open a detail view per protocol
with the model breakdown, a recompute check, live comparables, and a 7-step
farm plan. `board.json` carries the full ranking; `screenshots/` shows the
dashboard running.

## Run it

Requires Node.js 22.18 or later. The entrypoint reads the sealed snapshot at
`/input/snapshot.json` (the competition harness provides it when grading) and
writes the ranking to `/output/`:

```sh
node main.ts
```

To rebuild locally, point `/input/snapshot.json` at the kit snapshot first
(for example, symlink the kit's `input/snapshot.json` there), then run the
command above from the repository root. It writes `/output/board.json`,
`/output/data.js`, the dashboard, the screenshots, and `/output/dossier.json`.

## Entry

Built for the make.fun bounty [Build the best token launch radar](https://make.fun/bounty/token-radar-01).
