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
}

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

const host = (u?: string) => {
  try { return u ? new URL(u).hostname.replace(/^www\./, "").toLowerCase() : undefined; } catch { return undefined; }
};

/** Prefer the largest-TVL match (handles shared handles / multi-listing). */
const pickBest = (list: LlamaProtocol[]) =>
  list.sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))[0] ?? null;

export async function findProtocolByTwitter(handle: string): Promise<LlamaProtocol | null> {
  const all = await llamaProtocols();
  if (!all) return null;
  const h = handle.toLowerCase();
  return pickBest(all.filter((p) => p.twitter?.toLowerCase() === h));
}

/** "ethena_labs" → "ethena", "uniswapfdn" → "uniswap" … */
const HANDLE_SUFFIX = /[_-]?(labs?|hq|official|protocol|finance|fi|xyz|io|app|network|foundation|fdn|dao|team|global|ai)$/i;
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
  return pickBest(all.filter((p) =>
    (p.twitter && coreHandle(p.twitter) === core) ||
    (p.slug && p.slug.replace(/-/g, "") === core)));
}

/** Drop referral paths/queries: "https://app.x.fi/join/abc?ref=1" → "https://app.x.fi/". */
export const siteOrigin = (u?: string) => {
  try { return u ? `${new URL(u).origin}/` : undefined; } catch { return undefined; }
};

export async function findProtocolByDomain(domain: string): Promise<LlamaProtocol | null> {
  const all = await llamaProtocols();
  if (!all) return null;
  const d = domain.toLowerCase();
  return pickBest(all.filter((p) => {
    const h = host(p.url);
    return h === d || (h && (h.endsWith(`.${d}`) || d.endsWith(`.${h}`)));
  }));
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
  "Chain": ["l1"], "CEX": ["cex"],
  "Algo-Stables": ["stablecoin", "defi"], "Reserve Currency": ["stablecoin", "defi"], "Stablecoins": ["stablecoin"],
  "Payments": ["fintech"], "Crypto Card Issuer": ["fintech"], "Wallets": ["wallet"],
  "Gaming": ["dapp"], "SoFi": ["dapp"], "AI Agents": ["dapp"], "Services": ["web3_infra"],
};
export function mapCategory(category?: string): Segment[] {
  if (!category) return ["defi"];
  return CATEGORY_MAP[category] ?? ["defi"]; // everything on DefiLlama is at least DeFi-adjacent
}

export const protocolUrl = (p: LlamaProtocol) =>
  `https://defillama.com/protocol/${p.slug ?? p.name.toLowerCase().replace(/\s+/g, "-")}`;
