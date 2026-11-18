/** Profile: merge facts into one project profile. Re-run after social/people add facts. */
import { FK } from "@/lib/domain/fact-keys";
import type { Contact, Profile, Segment, Stage } from "@/lib/domain/types";
import { Segment as SegmentEnum, Stage as StageEnum } from "@/lib/domain/types";
import type { AnalysisContext, Step } from "../types";

const STAGE_ORDER: Stage[] = ["unknown", "idea", "testnet", "pre_mainnet", "mainnet", "scaling"];
const AFFIL_RANK = { strong: 0, medium: 1, weak: 2 } as const;

export function buildProfile(ctx: AnalysisContext): Profile {
  const of = (k: string) => ctx.facts.filter((f) => f.key === k);

  // Structured sources (confidence ≥ 0.9) define the segment; keyword guesses only fill in when none exist.
  const segFacts = of(FK.segment);
  const structured = segFacts.filter((f) => f.confidence >= 0.9);
  const segments = [...new Set(
    (structured.length ? structured : segFacts)
      .map((f) => SegmentEnum.safeParse(f.value)).filter((r) => r.success).map((r) => r.data as Segment),
  )];
  const tvl = of(FK.tvl).map((f) => Number(f.value)).filter((n) => n > 0).sort((a, b) => b - a)[0];
  const codeLoc = of(FK.codeLoc).map((f) => Number(f.value)).filter((n) => n > 0)[0];

  // most advanced stage mentioned wins
  const stages = of(FK.stage).map((f) => StageEnum.safeParse(f.value)).filter((r) => r.success).map((r) => r.data as Stage);
  const stage = stages.sort((a, b) => STAGE_ORDER.indexOf(b) - STAGE_ORDER.indexOf(a))[0] ?? "unknown";

  // funding: largest reported round, most recent date (news often repeats the same round)
  const rounds = of(FK.funding).map((f) => ({ usd: (f.value as { amountUsd?: number })?.amountUsd ?? 0, at: f.observedAt }));
  const largest = [...rounds].sort((a, b) => b.usd - a.usd)[0];
  const latestAt = rounds.map((r) => r.at).filter(Boolean).sort().reverse()[0];

  // contacts: dedupe by handle/name, strongest affiliation first
  const byKey = new Map<string, Contact>();
  for (const f of of(FK.contact)) {
    const c = { ...(f.value as Contact), factId: f.id };
    const key = (c.handle ?? c.name ?? f.id).toLowerCase();
    const prev = byKey.get(key);
    if (!prev || AFFIL_RANK[c.affiliation ?? "weak"] < AFFIL_RANK[prev.affiliation ?? "weak"]) byKey.set(key, c);
  }
  const contacts = [...byKey.values()].sort(
    (a, b) => AFFIL_RANK[a.affiliation ?? "weak"] - AFFIL_RANK[b.affiliation ?? "weak"],
  );

  return {
    name: ctx.project.name ?? ctx.project.domain,
    segments: segments.length ? segments : ["other"],
    stage,
    isB2B: of(FK.b2b).length ? true : undefined,
    hasToken: of(FK.token).length ? true : undefined,
    fundingUsd: largest?.usd || undefined,
    lastFundingAt: latestAt,
    tvlUsd: tvl,
    codeLoc,
    languages: [...new Set(of(FK.language).map((f) => String(f.value)))],
    contacts,
  };
}

export const profile: Step = {
  name: "profile",
  async run(ctx) {
    const p = buildProfile(ctx);
    const warnings = p.segments[0] !== "other"
      ? ctx.warnings
      : [...ctx.warnings, "Could not determine segment — ICP filter will likely exclude everything."];
    return { profile: p, warnings };
  },
};
