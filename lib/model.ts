// Token launch radar, model "radar-2".
//
// Everything here is derived from the sealed snapshot alone: no protocol
// name is hardcoded anywhere. The implied value of a pre-token protocol is
// its TVL times the median market-cap/TVL ratio of the live-token protocols
// in its own category, adjusted for 7-day growth, for how long it has run
// with no token recorded, and for how many chains it runs on.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  category_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface CategoryMultiple {
  category: string;
  n: number;
  median: number;
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

/** The model's fixed parameters, written out so the dashboard can show them. */
export const MODEL_PARAMS = {
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.3,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_cap: 5,
  multiple_floor: 0.05,
  multiple_cap: 2.5,
  min_category_n: 3,
} as const;

export const MODEL_VERSION = 'radar-2';

/** Round to 4 decimals the way the board's displayed multiples are rounded. */
export function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

/** A protocol records a token when DefiLlama carries both a gecko id and a symbol. */
export function recordsToken(p: SnapshotProtocol): boolean {
  return p.gecko_id !== null && p.symbol !== null;
}

/**
 * The live-token set the multiples are learned from: protocols that record
 * a token and carry a positive market cap. A zero or negative market cap is
 * a dead or unpriced listing, not a comparable.
 */
export function liveProtocols(protocols: SnapshotProtocol[]): SnapshotProtocol[] {
  return protocols.filter(
    (p) => recordsToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );
}

export interface Multiples {
  /** Median mcap/TVL across all live protocols, rounded to 4 decimals. */
  global: number;
  /** One entry per category with at least min_category_n live protocols. */
  byCategory: CategoryMultiple[];
}

/** Learn the value multiples from the snapshot's own live-token protocols. */
export function learnMultiples(protocols: SnapshotProtocol[]): Multiples {
  const live = liveProtocols(protocols);
  const global = round4(median(live.map((p) => (p.mcap_usd as number) / p.tvl_usd)));
  const ratios = new Map<string, number[]>();
  for (const p of live) {
    if (p.category === null) continue;
    const bucket = ratios.get(p.category);
    if (bucket) bucket.push((p.mcap_usd as number) / p.tvl_usd);
    else ratios.set(p.category, [(p.mcap_usd as number) / p.tvl_usd]);
  }
  const byCategory: CategoryMultiple[] = [];
  for (const category of [...ratios.keys()].sort((a, b) =>
    a.toLowerCase() < b.toLowerCase() ? -1 : 1,
  )) {
    const rs = ratios.get(category) as number[];
    if (rs.length < MODEL_PARAMS.min_category_n) continue;
    const raw = median(rs);
    const clamped = clamp(raw, MODEL_PARAMS.multiple_floor, MODEL_PARAMS.multiple_cap);
    byCategory.push({ category, n: rs.length, median: round4(clamped) });
  }
  return { global, byCategory };
}

export function multipleFor(category: string | null, multiples: Multiples): number {
  const hit = multiples.byCategory.find((m) => m.category === category);
  return hit ? hit.median : multiples.global;
}

/** Whole days between the snapshot date and the day tracking began. */
export function ageInDays(listedAt: string | null, asOf: Date): number | null {
  if (listedAt === null) return null;
  const listed = new Date(listedAt + 'T00:00:00Z');
  return Math.floor((asOf.getTime() - listed.getTime()) / 86400000);
}

/**
 * Score one protocol. The category multiple is rounded to 4 decimals before
 * it is used, so the dashboard's recompute lands on the same dollar; the
 * growth and maturity factors enter unrounded and are only rounded for
 * display, which is why the breakdown shows rounded factors next to an
 * implied value computed from the raw ones.
 */
export function scoreProtocol(
  p: SnapshotProtocol,
  multiples: Multiples,
  asOf: Date,
): { breakdown: ModelBreakdown; implied: number } {
  const multiple = multipleFor(p.category, multiples);
  const change = p.change_7d === null ? 0 : p.change_7d;
  const growthPct = clamp(change, MODEL_PARAMS.growth_floor, MODEL_PARAMS.growth_cap);
  const growth = 1 + (growthPct / 100) * MODEL_PARAMS.growth_weight;
  const age = ageInDays(p.listed_at, asOf);
  const effectiveAge = age === null ? MODEL_PARAMS.unknown_age_days : age;
  const maturity =
    MODEL_PARAMS.maturity_floor +
    (Math.min(effectiveAge, MODEL_PARAMS.maturity_days) / MODEL_PARAMS.maturity_days) *
      MODEL_PARAMS.maturity_range;
  const chain =
    1 + MODEL_PARAMS.chain_step * Math.min(p.chains.length - 1, MODEL_PARAMS.chain_cap);
  const implied = Math.max(1, Math.round(p.tvl_usd * multiple * growth * maturity * chain));
  return {
    breakdown: {
      category_multiple: multiple,
      growth_pct: growthPct,
      growth_multiplier: round4(growth),
      maturity_multiplier: round4(maturity),
      chain_multiplier: chain,
      age_days: age,
    },
    implied,
  };
}

/** Categories whose products are wrapped, staked or bridged forms of a token that trades. */
const WRAPPED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A name ending in a version marker: a space, then V2 / v2 / 2.0 or the like. */
export function isVersioned(name: string): boolean {
  return /\s(v\d+|V\d+|\d+\.\d+)$/.test(name);
}

/**
 * The watchlist rule, applied to any protocol: records no token, not a
 * wrapped/staked/bridged product, and no exchange or versioned name. This is
 * the same rule the house used for the watchlist, so it also picks the early
 * protocols below the floor.
 */
export function passesWatchlistRule(p: SnapshotProtocol): boolean {
  // Pre-token means the record carries neither a gecko id nor a symbol:
  // a symbol alone already names a token that trades.
  if (p.gecko_id !== null || p.symbol !== null) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  if (isVersioned(p.name)) return false;
  return true;
}

/** Build the ranked board: the whole watchlist plus the early strict-rankable protocols below the floor. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const asOf = new Date(snapshot.as_of + 'T00:00:00Z');
  const multiples = learnMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const pool = snapshot.protocols.filter(
    (p) => watchlist.has(p.slug) || (p.tvl_usd < snapshot.floor_usd && passesWatchlistRule(p)),
  );
  const scored = pool.map((p) => ({ p, ...scoreProtocol(p, multiples, asOf) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map(({ p, breakdown, implied }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: breakdown.age_days,
    implied_value_usd: implied,
    model: breakdown,
    farm_steps: farmPlan(p, breakdown.age_days),
  }));
}

/** The live-token protocols set aside from the ranking, biggest market cap first. */
export function liveSet(protocols: SnapshotProtocol[], count: number): LiveRow[] {
  return liveProtocols(protocols)
    .filter((p) => p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number) || (a.slug < b.slug ? -1 : 1))
    .slice(0, count)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));
}

// --- Farm plan -----------------------------------------------------------------

const VAULT_CATEGORIES = new Set(['Risk Curators', 'Onchain Capital Allocator']);
const SUPPLY_CATEGORIES = new Set(['Lending', 'CDP', 'Collateral Markets', 'Uncollateralized Lending']);
const LIQUIDITY_CATEGORIES = new Set(['Dexs', 'Indexes', 'Leveraged Farming', 'Yield', 'Yield Aggregator']);
const MARGIN_CATEGORIES = new Set(['Derivatives', 'Interest Rate Derivatives']);
const STAKE_CATEGORIES = new Set(['Restaking', 'Staking Pool']);
const STABLE_CATEGORIES = new Set(['Dual-Token Stablecoin', 'Stablecoin Wrapper']);

/** Position size by protocol size: bigger protocols get a bigger farming ticket. */
export function farmTier(tvlUsd: number): number {
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, by how long the protocol has already run. */
export function holdDays(ageDays: number | null): number {
  const effective = ageDays === null ? MODEL_PARAMS.unknown_age_days : ageDays;
  if (effective < 180) return 60;
  if (effective < 365) return 45;
  return 30;
}

/** The main farming action, chosen by what the protocol actually does. */
export function farmAction(p: SnapshotProtocol, tier: number): string {
  const chain = p.chains[0];
  const name = p.name;
  const cat = p.category;
  if (VAULT_CATEGORIES.has(cat as string)) {
    return `Deposit $${tier} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  }
  if (SUPPLY_CATEGORIES.has(cat as string)) {
    return `Supply $${tier} of USDC to ${name} on ${chain}, then borrow a small amount against it so both sides of the position are active.`;
  }
  if (LIQUIDITY_CATEGORIES.has(cat as string)) {
    return `Provide $${tier} of liquidity to ${name}'s main pool on ${chain} in a narrow range and keep the position open.`;
  }
  if (MARGIN_CATEGORIES.has(cat as string)) {
    return `Deposit $${tier} of USDC as margin on ${name} and open one small hedged trade, then close it the same week.`;
  }
  if (cat === 'RWA') {
    return `Mint $${tier} of the protocol's yield-bearing asset on ${chain} and hold it without moving it between wallets.`;
  }
  if (STABLE_CATEGORIES.has(cat as string)) {
    return `Mint or deposit $${tier} of the stable asset through ${name} on ${chain} and hold it for the full period.`;
  }
  if (STAKE_CATEGORIES.has(cat as string)) {
    return `Stake $${tier} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  }
  if (cat === 'Chain') {
    return `Bridge $${tier} to ${name} on ${chain}, use one of its native apps, and keep the funds there.`;
  }
  if (cat === 'Payments') {
    return `Send $${tier} through ${name} on ${chain} for a real payment and keep the receipt.`;
  }
  if (cat === 'Insurance') {
    return `Buy $${tier} of cover from ${name} on ${chain} and keep the policy active for the full period.`;
  }
  if (cat === 'Prediction Market') {
    return `Fund $${tier} on ${name} and place one small market position, then settle it before the market resolves.`;
  }
  return `Deposit $${tier} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The risk step, naming what can actually go wrong for this kind of protocol. */
export function farmRisk(category: string | null): string {
  const tail =
    ' Cost: nothing to check, and it can save the whole position. Time: 10 minutes to read the docs.';
  if (SUPPLY_CATEGORIES.has(category as string)) {
    return `A sharp price drop can liquidate a borrow, so keep the loan small next to the supplied collateral and watch the health factor.${tail}`;
  }
  if (MARGIN_CATEGORIES.has(category as string)) {
    return `Leverage can wipe margin fast, so keep the trade small, use an isolated margin account and set a stop before you open it.${tail}`;
  }
  if (LIQUIDITY_CATEGORIES.has(category as string)) {
    return `Impermanent loss can eat the yield if the pair moves hard, so use a stable pair or a narrow range and check the position weekly.${tail}`;
  }
  if (category === 'RWA') {
    return `The underlying asset can be frozen or revalued, so read what backs the token before you mint.${tail}`;
  }
  if (STAKE_CATEGORIES.has(category as string)) {
    return `Staked funds can be locked or slashed, so check the unbonding period before you stake anything.${tail}`;
  }
  if (category === 'Insurance') {
    return `Cover pays only for the events it names, so read the policy terms before you buy.${tail}`;
  }
  return `Smart contract risk applies to every protocol, so never farm with funds you cannot afford to lose and check the protocol's audits first.${tail}`;
}

/** Seven concrete steps with a cost and a time on each, derived from the record alone. */
export function farmPlan(p: SnapshotProtocol, ageDays: number | null): string[] {
  const tier = farmTier(p.tvl_usd);
  const gas = tier >= 150 ? 8 : 4;
  const hold = holdDays(ageDays);
  return [
    'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper. Cost: under $3 of gas for the first transaction. Time: 5 minutes.',
    `${farmAction(p, tier)} Cost: $${tier} of capital and about $${gas} of gas. Time: 15 minutes to set up.`,
    'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep doing it while the position is open. Cost: about $2 of gas a week. Time: 10 minutes a week.',
    `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot. Cost: the $${tier} stays in the position. Time: ${hold} days.`,
    farmRisk(p.category),
    "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes, and never pay a fee to claim. Cost: no fee to check. Time: 10 minutes.",
    'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it later. Cost: nothing but the log. Time: 5 minutes.',
  ];
}

// --- Dashboard data --------------------------------------------------------------

export interface DashboardData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: typeof MODEL_PARAMS;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  global_multiple: number;
  multiples: CategoryMultiple[];
  rows: {
    rank: number;
    slug: string;
    name: string;
    category: string | null;
    chains: string[];
    tvl_usd: number;
    change_7d: number | null;
    mcap_usd: number | null;
    listed_at: string | null;
    age_days: number | null;
    implied_value_usd: number;
    category_multiple: number;
    on_watchlist: boolean;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
  }[];
  live: LiveRow[];
}

/** The object the dashboard page reads: board rows plus the live set and the multiples table. */
export function buildDashboardData(snapshot: Snapshot, rows: BoardRow[]): DashboardData {
  const multiples = learnMultiples(snapshot.protocols);
  const watchlist = new Set(snapshot.watchlist);
  const live = liveSet(snapshot.protocols, 24);
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL_PARAMS,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: rows.length,
    early_size: rows.length - snapshot.watchlist.length,
    live_size: live.length,
    global_multiple: multiples.global,
    multiples: multiples.byCategory,
    rows: rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      on_watchlist: watchlist.has(r.slug),
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      chain_multiplier: r.model.chain_multiplier,
    })),
    live,
  };
}
