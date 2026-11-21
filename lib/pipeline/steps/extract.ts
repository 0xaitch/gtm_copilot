/**
 * Step 4 — Extract: sources → structured facts, each with source URL + quote.
 * With an LLM configured, uses schema-validated extraction; otherwise a
 * transparent keyword heuristic so the pipeline runs end-to-end with no keys.
 */
import { z } from "zod";
import type { Fact, Segment, Source, TriggerType } from "@/lib/domain/types";
import { Segment as SegmentEnum, TriggerType as TriggerEnum } from "@/lib/domain/types";
import { FK } from "@/lib/domain/fact-keys";
import type { Step } from "../types";
import { dateNear, newId, parseUsdAmount, snippet } from "../util";


/* ---------------- Heuristic extractor ---------------- */

type Rule = {
  re: RegExp;
  build: (m: RegExpMatchArray, s: Source) => Omit<Fact, "id" | "sourceUrl" | "quote"> | null;
};

const seg = (value: Segment): Rule["build"] => () => ({ key: FK.segment, value, kind: "fact", confidence: 0.7 });
const trig = (type: TriggerType, conf = 0.6): Rule["build"] => (m, s) => ({
  key: FK.trigger, kind: "fact", confidence: conf,
  value: { type }, observedAt: dateNear(s.text, m.index ?? 0),
});

/** Segment detectors: [pattern, segment]. Counted across all sources to pick dominant segments. */
export const SEGMENT_RULES: [RegExp, Segment][] = [
  [/\b(decentrali[sz]ed exchange|\bDEX\b|swap protocol|AMM)\b/i, "dex"],
  [/\b(lending|borrow(ing)?) (protocol|market)/i, "lending"],
  [/\b(liquid )?staking\b/i, "staking"],
  [/\bstablecoin\b/i, "stablecoin"],
  [/\b(real[- ]world assets?|\bRWA\b|tokeni[sz]ed (treasur|bond|real estate))/i, "rwa"],
  [/\blaunchpad\b/i, "launchpad"],
  [/\bNFT marketplace\b/i, "nft_marketplace"],
  [/\bNFTs?\b/, "nft"],
  [/\b(layer[- ]?2|\bL2\b|rollup)\b/i, "l2"],
  [/\b(layer[- ]?1|\bL1\b) (blockchain|chain|network)\b/i, "l1"],
  [/\b(appchain|subnet)\b/i, "appchain"],
  [/\b(self[- ]custod(y|ial) wallet|crypto wallet|wallet app)\b/i, "wallet"],
  [/\b(crypto exchange|spot (and|&) futures trading|centrali[sz]ed exchange)\b/i, "cex"],
  [/\bDeFi\b/, "defi"],
  [/\b(dApp|smart contracts?)\b/i, "dapp"],
  [/\b(SaaS|software[- ]as[- ]a[- ]service|free trial|start (for )?free|workspace|SSO|SAML|integrations|per (seat|user)\/?(month|mo)?|enterprise plan)\b/i, "saas"],
  [/\b(payments? (platform|infrastructure|processing)|neobank|fintech|card issuing|money transfer|KYC)\b/i, "fintech"],
  [/\b(patient data|HIPAA|EHR|EMR|telehealth|clinical (trials?|workflows?)|healthcare providers?)\b/i, "healthtech"],
];

const RULES: Rule[] = [
  // segments (see SEGMENT_RULES)
  ...SEGMENT_RULES.map(([re, value]): Rule => ({ re, build: seg(value) })),

  // stage
  { re: /\btestnet (is )?(now )?(live|launched)\b/i, build: (m, s) => ({ key: FK.stage, value: "testnet", kind: "fact", confidence: 0.7, observedAt: dateNear(s.text, m.index ?? 0) }) },
  { re: /\bmainnet (is )?(coming|soon|launch(ing)? (on|in))\b/i, build: (m, s) => ({ key: FK.stage, value: "pre_mainnet", kind: "fact", confidence: 0.6, observedAt: dateNear(s.text, m.index ?? 0) }) },
  { re: /\b(live on mainnet|mainnet (is )?(now )?live|launched on mainnet)\b/i, build: (m, s) => ({ key: FK.stage, value: "mainnet", kind: "fact", confidence: 0.7, observedAt: dateNear(s.text, m.index ?? 0) }) },
  // web2: a product with paying customers is "live"
  { re: /\b(trusted by|used by (\d|thousands|teams)|our customers|book a demo|start free trial|pricing plans?)\b/i, build: () => ({ key: FK.stage, value: "mainnet", kind: "inference", confidence: 0.5 }) },

  // business
  { re: /\b(for (enterprises|businesses|institutions)|institutional[- ]grade|enterprise (clients|customers|partners)|B2B)\b/i, build: () => ({ key: FK.b2b, value: true, kind: "inference", confidence: 0.6 }) },
  { re: /\b(\$[A-Z]{2,6}\b|token(omics| generation event|\s+TGE)|airdrop)/, build: () => ({ key: FK.token, value: true, kind: "fact", confidence: 0.6 }) },

  // money
  { re: /\b(raised|raises|closes?|secured)\b[^.]{0,80}?\$\s?\d+(\.\d+)?\s?(k|m|mm|million|b|billion)\b/i,
    build: (m, s) => {
      const amount = parseUsdAmount(m[0]);
      return amount ? { key: FK.funding, value: { amountUsd: amount }, kind: "fact", confidence: 0.7, observedAt: dateNear(s.text, m.index ?? 0) } : null;
    } },

  // posture
  { re: /\b(audited by|audit (report|by)|security audits?)\b/i, build: (m, s) => ({ key: FK.audit, value: { mention: m[0] }, kind: "fact", confidence: 0.6, observedAt: dateNear(s.text, m.index ?? 0) }) },
  { re: /\b(penetration test(ing|ed)?|pen ?test(ed)?)\b/i, build: (m, s) => ({ key: FK.pentest, value: { mention: m[0] }, kind: "fact", confidence: 0.5, observedAt: dateNear(s.text, m.index ?? 0) }) },
  { re: /\bSOC ?2( Type (I|II|1|2))?\b/i, build: () => ({ key: FK.compliance, value: "soc2", kind: "fact", confidence: 0.6 }) },
  { re: /\bISO\/?(IEC)? ?27001\b/i, build: () => ({ key: FK.compliance, value: "iso27001", kind: "fact", confidence: 0.6 }) },
  { re: /\b(bug bounty|immunefi|hackerone)\b/i, build: () => ({ key: FK.bugBounty, value: true, kind: "fact", confidence: 0.7 }) },
  { re: /\b(exploit(ed)?|hack(ed)?|drained|post[- ]mortem)\b/i, build: (m, s) => ({ key: FK.incident, value: { mention: m[0] }, kind: "inference", confidence: 0.4, observedAt: dateNear(s.text, m.index ?? 0) }) },

  // triggers
  { re: /\b(testnet (is )?(now )?(live|launch))/i, build: trig("testnet_launch") },
  { re: /\bmainnet\b[^.]{0,40}\b(launch|live|coming)/i, build: trig("mainnet_launch") },
  { re: /\b(TGE|token generation event|token launch)\b/i, build: trig("token_launch") },
  { re: /\b(raised|raises|seed round|series [a-c]|strategic round)\b/i, build: trig("funding", 0.7) },
  // evergreen "backed by / has raised from" → investor-backed (ability to pay), not a why-now trigger
  { re: /\b(backed by|has raised|raised (money|capital|funding) from|investors include|our investors)\b/i, build: () => ({ key: FK.funding, value: { backed: true }, kind: "fact", confidence: 0.7 }) },
  { re: /\b(partners? with|partnership with|strategic partnership)\b/i, build: trig("partnership", 0.5) },
  { re: /\b(hiring|we're hiring|join us)\b[^.]{0,60}\b(security|compliance|CISO)\b/i, build: trig("security_hiring", 0.6) },

  // languages
  { re: /\bSolidity\b/, build: () => ({ key: FK.language, value: "solidity", kind: "fact", confidence: 0.7 }) },
  { re: /\b(Rust|Anchor)\b/, build: () => ({ key: FK.language, value: "rust", kind: "fact", confidence: 0.5 }) },
  { re: /\bMove\b (language|smart contracts?)/i, build: () => ({ key: FK.language, value: "move", kind: "fact", confidence: 0.6 }) },
];

const ROLE_RE = /\b([A-Z][a-z]+ [A-Z][a-z]+)\s*[,|–—-]\s*(Co-?founder (?:&|and) CTO|Co-?founder (?:&|and) CEO|CTO|CEO|CISO|COO|Chief [A-Z][a-z]+ Officer|Head of [A-Z][a-z]+(?: [A-Z][a-z]+)?|Co-?founder)\b/g;

/**
 * "X was (co-)founded by Cambridge mathematicians Jane Doe and John Smith." → founders.
 * Looks only within the sentence; a person name = 2–3 capitalised words (each with lowercase letters).
 */
const FOUNDED_BY = /\b(?:co-?)?founded\s+(?:in\s+\d{4}\s+)?by\b([^.!?\n]{3,160})/gi;
const PERSON = /\b([A-Z][a-z]+(?:[ -](?:[A-Z][a-z]+|[A-Z]\.)){1,2})\b/g;
const NOT_PERSON = /\b(Labs?|Capital|Ventures|Research|Foundation|Protocol|Network|Exchange|University|College|Combinator|Catalyst|Traders|Street|Group|Inc|Ltd|Fund|Partners)\b/;
export function foundersIn(text: string): { name: string; index: number; phrase: string }[] {
  const out: { name: string; index: number; phrase: string }[] = [];
  for (const m of text.matchAll(FOUNDED_BY)) {
    for (const p of m[1].matchAll(PERSON)) {
      if (!NOT_PERSON.test(p[1])) out.push({ name: p[1], index: m.index ?? 0, phrase: m[0] });
    }
  }
  return out;
}

export function heuristicExtract(sources: Source[]): Fact[] {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    for (const rule of RULES) {
      const m = s.text.match(rule.re);
      if (!m) continue;
      const f = rule.build(m, s);
      if (!f) continue;
      const dedupe = `${f.key}:${JSON.stringify(f.value)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      facts.push({ ...f, id: newId("fact"), sourceUrl: s.url, quote: snippet(s.text, m.index ?? 0, m[0].length) });
    }
    for (const m of s.text.matchAll(ROLE_RE)) {
      const dedupe = `contact:${m[1]}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      facts.push({
        id: newId("fact"), key: FK.contact, value: { name: m[1], role: m[2], affiliation: "strong", evidence: "named with role on project website", sourceUrl: s.url }, kind: "fact",
        confidence: 0.6, sourceUrl: s.url, quote: snippet(s.text, m.index ?? 0, m[0].length, 30),
      });
    }
    for (const { name, index, phrase } of foundersIn(s.text)) {
      const dedupe = `contact:${name}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      facts.push({
        id: newId("fact"), key: FK.contact,
        value: { name, role: "Co-founder", affiliation: "strong", evidence: "named as founder on project site/docs", sourceUrl: s.url },
        kind: "fact", confidence: 0.75, sourceUrl: s.url, quote: snippet(s.text, index, phrase.length, 40),
      });
    }
  }
  return pruneSegments(facts, sources);
}

/**
 * A single passing mention ("NFT", "stablecoin") shouldn't define what a project is.
 * Keep only dominant segments by total mention count across all sources.
 */
const MAX_SEGMENTS = 3;
function pruneSegments(facts: Fact[], sources: Source[]): Fact[] {
  const corpus = sources.map((s) => s.text).join("\n");
  const segRules = new Map<string, RegExp>(SEGMENT_RULES.map(([re, v]) => [v, re]));
  const counts = facts
    .filter((f) => f.key === FK.segment)
    .map((f) => {
      const re = segRules.get(String(f.value));
      const n = re ? [...corpus.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g"))].length : 1;
      return { id: f.id, n };
    })
    .sort((a, b) => b.n - a.n);
  const top = counts[0]?.n ?? 0;
  const keep = new Set(
    counts.filter((c, i) => i < MAX_SEGMENTS && c.n >= Math.max(2, top * 0.25)).map((c) => c.id),
  );
  if (!keep.size && counts[0]) keep.add(counts[0].id); // always keep the strongest one
  return facts
    .filter((f) => f.key !== FK.segment || keep.has(f.id))
    .map((f) => {
      const c = counts.find((x) => x.id === f.id);
      return c ? { ...f, confidence: Math.min(0.85, 0.5 + c.n * 0.05) } : f; // keyword guesses stay below structured data (≥ 0.9)
    });
}

/* ---------------- LLM extractor ---------------- */

const LlmFacts = z.object({
  facts: z.array(z.object({
    key: z.enum(Object.values(FK) as [string, ...string[]]),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.string(), z.unknown())]),
    kind: z.enum(["fact", "inference"]),
    quote: z.string().describe("verbatim text from the source supporting this"),
    observedAt: z.string().optional().describe("ISO date the fact refers to, if stated"),
    confidence: z.number().min(0).max(1),
  })),
});

const SYSTEM = `You extract facts about a company/project for a security-services sales team.
Only state what the source text supports. Every item needs a verbatim quote.
Use kind="inference" for anything not explicitly stated.
Allowed segment values: ${SegmentEnum.options.join(", ")}.
Allowed trigger types (key="trigger", value={type}): ${TriggerEnum.options.join(", ")}.`;

export const extract: Step = {
  name: "extract",
  async run(ctx, { llm }) {
    if (!llm) return { facts: heuristicExtract(ctx.sources) };
    const facts: Fact[] = [];
    for (const s of ctx.sources) {
      const out = await llm.generateObject({
        system: SYSTEM,
        prompt: `SOURCE URL: ${s.url}\n\nSOURCE TEXT:\n${s.text.slice(0, 24_000)}`,
        schema: LlmFacts,
      });
      for (const f of out.facts) {
        // reject quotes that don't actually appear in the source (hallucination guard)
        if (!s.text.includes(f.quote.slice(0, 40))) continue;
        facts.push({ ...f, id: newId("fact"), sourceUrl: s.url });
      }
    }
    return { facts };
  },
};
