/**
 * Step 4b — Enrich: structured, dated facts from free public data sources.
 *  - DefiLlama protocols: segment, TVL, chains, audit links, growth
 *  - DefiLlama hacks: own incidents + same-category incidents on the same chains
 *  - GitHub: code activity, contract languages, LOC estimate, audits folder/repo dates
 * Structured facts carry confidence ≥ 0.9 so they outrank keyword heuristics.
 */
import { githubOrgForHandle, githubSummary, parseGithubOwner } from "@/lib/connectors/github";
import {
  coreHandle, findProtocolByDomain, findProtocolByTwitter, llamaHacks, llamaProtocols, mapCategory, protocolUrl,
  type LlamaProtocol,
} from "@/lib/connectors/defillama";
import { FK } from "@/lib/domain/fact-keys";
import type { Fact } from "@/lib/domain/types";
import type { Step } from "../types";
import { newId } from "../util";

const DAY = 86_400_000;
const ECOSYSTEM_WINDOW_DAYS = 30;
const MIN_INCIDENT_USD = 100_000;
const GROWTH_SPIKE_PCT = 25;
const NEW_REPO_DAYS = 60;

const usd = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

function fact(f: Omit<Fact, "id">): Fact {
  return { ...f, id: newId("fact") };
}

async function fromDefiLlama(p: LlamaProtocol, now: Date): Promise<Fact[]> {
  const src = protocolUrl(p);
  const out: Fact[] = [];

  for (const seg of mapCategory(p.category)) {
    out.push(fact({ key: FK.segment, value: seg, kind: "fact", confidence: 0.92, sourceUrl: src, quote: `DefiLlama category: ${p.category}` }));
  }
  if (p.tvl && p.tvl > 0) {
    out.push(fact({ key: FK.tvl, value: p.tvl, kind: "fact", confidence: 0.95, sourceUrl: src, quote: `TVL ${usd(p.tvl)}`, observedAt: now.toISOString() }));
    out.push(fact({ key: FK.stage, value: "mainnet", kind: "fact", confidence: 0.9, sourceUrl: src, quote: `Live with ${usd(p.tvl)} TVL` }));
  }
  if (p.chains?.length) {
    out.push(fact({ key: FK.chains, value: p.chains, kind: "fact", confidence: 0.95, sourceUrl: src, quote: `Chains: ${p.chains.join(", ")}` }));
  }
  for (const link of p.audit_links ?? []) {
    out.push(fact({ key: FK.audit, value: { link }, kind: "fact", confidence: 0.85, sourceUrl: link, quote: `Audit link listed on DefiLlama (${p.audits ?? "?"} audits)` }));
  }
  if ((p.change_7d ?? 0) >= GROWTH_SPIKE_PCT) {
    out.push(fact({
      key: FK.trigger, value: { type: "growth_spike" }, kind: "fact", confidence: 0.9, sourceUrl: src,
      quote: `TVL +${p.change_7d!.toFixed(0)}% in 7 days`, observedAt: now.toISOString(),
    }));
  }

  // Incidents
  const [hacks, protocols] = await Promise.all([llamaHacks(), llamaProtocols()]);
  for (const h of (hacks ?? []).filter((x) => x.defillamaId && String(x.defillamaId) === String(p.id))) {
    const at = new Date(h.date * 1000).toISOString();
    const quote = `${h.name} incident: ${h.technique ?? h.classification ?? "exploit"}${h.amount ? `, ${usd(h.amount)}` : ""}`;
    out.push(fact({ key: FK.incident, value: { amountUsd: h.amount, technique: h.technique }, kind: "fact", confidence: 0.95, sourceUrl: "https://defillama.com/hacks", quote, observedAt: at }));
    out.push(fact({ key: FK.trigger, value: { type: "own_incident" }, kind: "fact", confidence: 0.95, sourceUrl: "https://defillama.com/hacks", quote, observedAt: at }));
  }

  const chains = new Set(p.chains ?? []);
  const categoryOf = new Map((protocols ?? []).map((x) => [String(x.id), x.category]));
  const peer = (hacks ?? [])
    .filter((h) =>
      h.date * 1000 > now.getTime() - ECOSYSTEM_WINDOW_DAYS * DAY &&
      String(h.defillamaId) !== String(p.id) &&
      (h.amount ?? 0) >= MIN_INCIDENT_USD &&
      h.chain?.some((c) => chains.has(c)) &&
      h.defillamaId && categoryOf.get(String(h.defillamaId)) === p.category)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  if (peer) {
    out.push(fact({
      key: FK.trigger, value: { type: "ecosystem_incident" }, kind: "fact", confidence: 0.85,
      sourceUrl: "https://defillama.com/hacks", observedAt: new Date(peer.date * 1000).toISOString(),
      quote: `Peer ${p.category} protocol ${peer.name} exploited on ${peer.chain?.join("/")}${peer.amount ? ` (${usd(peer.amount)})` : ""}`,
    }));
  }
  return out;
}

async function fromGithub(owner: string, now: Date): Promise<{ facts: Fact[]; warning?: string }> {
  const gh = await githubSummary(owner);
  if (!gh) return { facts: [] };
  const out: Fact[] = [];
  const warning = gh.rateLimited ? "GitHub rate limit hit — set GITHUB_TOKEN for complete code/audit data." : undefined;

  if (gh.lastPushAt) {
    out.push(fact({
      key: FK.codeActivity, value: { lastPushAt: gh.lastPushAt, repo: gh.lastPushRepo }, kind: "fact",
      confidence: 0.95, sourceUrl: gh.ownerUrl, quote: `Last push ${gh.lastPushAt.slice(0, 10)} (${gh.lastPushRepo})`,
      observedAt: gh.lastPushAt,
    }));
  }
  for (const lang of ["Solidity", "Vyper", "Move", "Cairo", "Rust"]) {
    if (gh.languages[lang]) {
      out.push(fact({ key: FK.language, value: lang.toLowerCase(), kind: "fact", confidence: 0.9, sourceUrl: gh.ownerUrl, quote: `${lang} in top repos` }));
    }
  }
  if (gh.contractLocEstimate) {
    out.push(fact({
      key: FK.codeLoc, value: gh.contractLocEstimate, kind: "inference", confidence: 0.6, sourceUrl: gh.ownerUrl,
      quote: `~${gh.contractLocEstimate.toLocaleString()} contract LOC (estimated from language bytes, top repos)`,
    }));
  }
  for (const a of gh.audits) {
    out.push(fact({
      key: FK.audit, value: { link: a.url, where: a.where }, kind: "fact", confidence: 0.9, sourceUrl: a.url,
      quote: `Audits in ${a.where}${a.lastCommitAt ? `, last updated ${a.lastCommitAt.slice(0, 10)}` : ""}`,
      observedAt: a.lastCommitAt,
    }));
  }
  const fresh = gh.repos.filter((r) => now.getTime() - new Date(r.created_at).getTime() < NEW_REPO_DAYS * DAY);
  if (fresh.length) {
    const r = fresh.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    out.push(fact({
      key: FK.trigger, value: { type: "product_launch" }, kind: "inference", confidence: 0.5, sourceUrl: r.html_url,
      quote: `New repo ${r.full_name} created ${r.created_at.slice(0, 10)}`, observedAt: r.created_at,
    }));
  }
  return { facts: out, warning };
}

export const enrich: Step = {
  name: "enrich",
  async run(ctx, { now }) {
    const facts = [...ctx.facts];
    const warnings = [...ctx.warnings];
    const project = { ...ctx.project };

    const llama =
      (project.xHandle ? await findProtocolByTwitter(project.xHandle) : null) ??
      (project.domain ? await findProtocolByDomain(project.domain) : null);
    if (llama) {
      facts.push(...(await fromDefiLlama(llama, now)));
      project.xHandle ??= llama.twitter ?? undefined;
      if (!project.github && llama.github?.[0]) project.github = `https://github.com/${llama.github[0]}`;
    }
    // Still no GitHub (site blocked bots, or doesn't link it)? Find the org whose profile lists the project's X handle.
    if (!project.github) {
      for (const h of [...new Set([project.xHandle, llama?.twitter].filter((x): x is string => !!x))]) {
        const org = await githubOrgForHandle(h, [coreHandle(h)]);
        if (org) { project.github = org.html_url; break; }
      }
    }

    const owner = parseGithubOwner(project.github);
    if (owner) {
      const gh = await fromGithub(owner, now);
      facts.push(...gh.facts);
      if (gh.warning) warnings.push(gh.warning);
    }
    return { facts, warnings, project };
  },
};
