// Token launch radar: read the sealed snapshot, rank the pre-token
// protocols by implied value, and write the board, the dashboard data and
// the dossier.
//
// Usage:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input path/to/snapshot.json
//
// The input defaults to /input/snapshot.json and the output directory to
// /output (or $MAKEFUN_OUTPUT_DIR). Standard library only, no network, and
// fully deterministic: two runs on the same snapshot write the same bytes.

import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBoard, buildDashboardData, type Snapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));

function flagValue(argv: string[], flag: string): string | null {
  const at = argv.indexOf(flag);
  if (at === -1 || at + 1 >= argv.length) return null;
  return argv[at + 1];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const inputPath = flagValue(argv, '--input') ?? '/input/snapshot.json';
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });

  const snapshot = JSON.parse(readFileSync(inputPath, 'utf8')) as Snapshot;
  const rows = buildBoard(snapshot);
  const data = buildDashboardData(snapshot, rows);

  writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows }) + '\n');
  writeFileSync(join(outDir, 'data.js'), 'window.RADAR=' + JSON.stringify(data) + ';\n');

  cpSync(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  const dossier = await buildDossier(outDir, { text_max_bytes: 65536 });
  writeFileSync(join(outDir, 'dossier.json'), dossier);

  const early = rows.length - snapshot.watchlist.length;
  const dashboardFiles = readdirSync(join(outDir, 'dashboard')).length;
  const shotFiles = readdirSync(join(outDir, 'screenshots')).length;
  console.log(
    `token radar: ${snapshot.protocols.length} protocols, ` +
      `${snapshot.watchlist.length} on the watchlist, ` +
      `${rows.length} rows scored (${early} early, ${data.live_size} live set aside)`,
  );
  console.log(
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ` +
      `${join(outDir, 'dashboard')} (${dashboardFiles} files), ` +
      `${join(outDir, 'screenshots')} (${shotFiles} images) and ${join(outDir, 'dossier.json')}`,
  );
}

try {
  await main();
} catch (err) {
  console.error('token radar: failed:', err instanceof Error ? err.message : err);
  process.exit(1);
}
