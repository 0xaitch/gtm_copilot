/**
 * DefiLlama public API (free, no key).
 *  - /protocols : ~9k protocols with url, twitter, category, chains, TVL, audit links, GitHub org
 *  - /hacks     : incident history (own + ecosystem incidents)
 * Responses are large, so they're cached in memory per server process.
 */
import type { Segment } from "@/lib/domain/types";

export interface LlamaProtocol {
  id: string;
  name: string;
  slug?: string;
  url?: string;
  twitter?: string | null;
  category?: string;
  chains?: string[];
  tvl?: number | null;
  change_7d?: number | null;
  audits?: string | null;
  audit_links?: string[];
  github?: string[];
  description?: string;
  parentProtocol?: string;    // "parent#jito" — groups a project's listings (staking, DAO, MEV…)
}

export interface LlamaParent { id: string; name: string; url?: string; twitter?: string | null }

export interface LlamaHack {
  date: number;               // unix seconds
  name: string;
  classification?: string;
  technique?: string;
  amount?: number | null;
  chain?: string[];
  defillamaId?: string | null;
  targetType?: string;
}

const BASE = "https://api.llama.fi";
const TTL_MS = 6 * 3600_000;
const cache = new Map<string, { at: number; data: unknown }>();

async function cached<T>(path: string): Promise<T | null> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  try {
    const res = await fetch(`${BASE}${path}`, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return (hit?.data as T) ?? null;
    const data = (await res.json()) as T;
    cache.set(path, { at: Date.now(), data });
    return data;
  } catch {
    return (hit?.data as T) ?? null; // serve stale on failure
  }
}

export const llamaProtocols = () => cached<LlamaProtocol[]>("/protocols");
export const llamaHacks = () => cached<LlamaHack[]>("/hacks");
/** Parent protocols carry the project's brand name and main site ("Jito", not "Jito Liquid Staking"). */
export const llamaParents = async () =>
  (await cached<{ parentProtocols?: LlamaParent[] }>("/lite/protocols2"))?.parentProtocols ?? [];

/** Brand name for a listing: its parent's name when it has one. */
export async function brandName(p: LlamaProtocol): Promise<string> {
  if (!p.parentProtocol) return p.name;
  return (await llamaParents()).find((x) => x.id === p.parentProtocol)?.name ?? p.name;
}

const host = (u?: string) => {
  try { return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : undefined; } catch { return undefined; }
};

/** Prefer the largest-TVL match (handles shared handles / multi-listing). */
const pickBest = (list: LlamaProtocol[]) =>
  list.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))[0] ?? null;

const SIDE_CATEGORIES = new Set(["Bridge", "Canonical Bridge", "Cross Chain Bridge", "Chain Bribes"]);

/**
 * Several listings often share one handle: a project's own family (staking, DAO, perps, bridge…)
 * plus third-party apps built on it. Pick the listing that best represents the project:
 *  1. keep the dominant parent family when there is one;
 *  2. otherwise prefer a listing named after the handle ("Berachain" over "BEND");
 *  3. skip bridges/bribes, take the most common category (perps over an earn vault), tie → TVL.
 */
export function pickForHandle(list: LlamaProtocol[], handle: string): LlamaProtocol | null {
  if (list.length <= 1) return list[0] ?? null;
  const tally = <K,>(items: LlamaProtocol[], key: (p: LlamaProtocol) => K) => {
    const m = new Map<K, { n: number; tvl: number }>();
    for (const p of items) {
      const cur = m.get(key(p)) ?? { n: 0, tvl: 0 };
      m.set(key(p), { n: cur.n + 1, tvl: cur.tvl + (p.tvl ?? 0) });
    }
    return [...m.entries()].sort((x, y) => y[1].n - x[1].n || y[1].tvl - x[1].tvl)[0]?.[0];
  };
  let pool = list;
  const parent = tally(list.filter((p) => p.parentProtocol), (p) => p.parentProtocol);
  if (parent) pool = list.filter((p) => p.parentProtocol === parent);
  else {
    const core = coreHandle(handle);
    const named = list.filter((p) => coreHandle(p.name.replace(/\s+/g, "")) === core);
    if (named.length) pool = named;
  }
  const main = pool.filter((p) => !SIDE_CATEGORIES.has(p.category ?? ""));
  if (main.length) pool = main;
  const category = tally(pool, (p) => p.category ?? "");
  return pickBest(pool.filter((p) => (p.category ?? "") === category));
}

export async function findProtocolByTwitter(handle: string): Promise<LlamaProtocol | null> {
  const all = await llamaProtocols();
  if (!all) return null;
  const h = handle.toLowerCase();
  return pickForHandle(all.filter((p) => p.twitter?.toLowerCase() === h), handle);
}

/** "ethena_labs" → "ethena", "uniswapfdn" → "uniswap" … */
const HANDLE_SUFFIX = /[_-]?(labs?|hq|official|protocol|finance|fi|xyz|io|app|network|foundation|fdn|dao|team|global|ai)$|[_-](sol|eth|base|arb|btc|sui|apt)$/i;
export const coreHandle = (h: string) => {
  let s = h.toLowerCase().replace(/^@/, "");
  for (let i = 0; i < 2; i++) s = s.replace(HANDLE_SUFFIX, "");
  return s.replace(/[_-]/g, "");
};

/**
 * Fuzzy fallback when DefiLlama stores a different/older handle:
 * compare the handle's core against protocol twitter cores and slugs. Lower confidence.
 */
export async function findProtocolByHandleFuzzy(handle: string): Promise<LlamaProtocol | null> {
  const all = await llamaProtocols();
  const core = coreHandle(handle);
  if (!all || core.length < 4) return null;
  return pickForHandle(all.filter((p) =>
    (p.twitter && coreHandle(p.twitter) === core) ||
    (p.slug && p.slug.replace(/-/g, "") === core)), handle);
}

/** Drop referral paths/queries: "https://app.x.fi/join/abc?ref=1" → "https://app.x.fi/". */
export const siteOrigin = (u?: string) => {
  try { return u ? `${new URL(u).origin}/` : undefined; } catch { return undefined; }
};

export async function findProtocolByDomain(domain: string): Promise<LlamaProtocol | null> {
  const all = await llamaProtocols();
  if (!all) return null;
  const d = domain.toLowerCase().replace(/^www\./, "");
  const sameSite = (u?: string) => {
    const h = host(u);
    return !!h && (h === d || h.endsWith(`.${d}`) || d.endsWith(`.${h}`));
  };
  const label = d.split(".").slice(-2)[0];
  let matches = all.filter((p) => sameSite(p.url));
  if (!matches.length) {
    // The listing may use another domain (kamino.com vs kamino.finance); the parent often keeps the old one.
    const parents = new Set((await llamaParents()).filter((x) => sameSite(x.url)).map((x) => x.id));
    matches = all.filter((p) => p.parentProtocol && parents.has(p.parentProtocol));
  }
  return pickForHandle(matches, label);
}

/** DefiLlama category → our Segment vocabulary. */
const CATEGORY_MAP: Record<string, Segment[]> = {
  "Dexs": ["dex", "defi"], "DEX Aggregator": ["dex", "defi"],
  "Lending": ["lending", "defi"], "CDP": ["lending", "stablecoin", "defi"], "NFT Lending": ["lending", "nft"],
  "Liquid Staking": ["staking", "defi"], "Staking Pool": ["staking", "defi"],
  "Restaking": ["staking", "defi"], "Liquid Restaking": ["staking", "defi"],
  "RWA": ["rwa", "defi"], "RWA Lending": ["rwa", "lending"],
  "Launchpad": ["launchpad"], "NFT Marketplace": ["nft_marketplace", "nft"],
  "Bridge": ["web3_infra"], "Cross Chain Bridge": ["web3_infra"], "Canonical Bridge": ["web3_infra"],
  "Chain": ["l1"], "Chain Bribes": ["l1"], "CEX": ["cex"],
  "Algo-Stables": ["stablecoin", "defi"], "Reserve Currency": ["stablecoin", "defi"], "Stablecoins": ["stablecoin"],
  "Derivatives": ["dex", "defi"], "Perpetuals": ["dex", "defi"], "Options": ["dex", "defi"], "Synthetics": ["defi"], "Prediction Market": ["dapp", "defi"],
  "Payments": ["fintech"], "Crypto Card Issuer": ["fintech"], "Wallets": ["wallet"],
  "Gaming": ["dapp"], "SoFi": ["dapp"], "AI Agents": ["dapp"], "Services": ["web3_infra"],
};
export function mapCategory(category?: string): Segment[] {
  if (!category) return ["defi"];
  return CATEGORY_MAP[category] ?? ["defi"]; // everything on DefiLlama is at least DeFi-adjacent
}

export const protocolUrl = (p: LlamaProtocol) =>
  `https://defillama.com/protocol/${p.slug ?? p.name.toLowerCase().replace(/\s+/g, "-")}`;
