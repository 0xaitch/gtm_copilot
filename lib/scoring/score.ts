/**
 * Deterministic scoring. No LLM calls here — scores must be reproducible
 * and explainable from facts + rubrik alone.
 */
import type {
  Confidence, Fact, Posture, PostureStatus, Profile, ServiceScore, SubScores, Trigger,
} from "@/lib/domain/types";
import type { Rubrik, ServiceDef, TicketBand, TriggerDef } from "@/lib/rubrik/schema";

const DAY = 86_400_000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const WEB3_SEGMENTS = new Set([
  "defi", "dex", "lending", "staking", "rwa", "stablecoin", "launchpad", "token_project",
  "nft", "nft_marketplace", "l1", "l2", "appchain", "wallet", "cex", "dapp", "web3_infra",
]);
export const isWeb3 = (p: Profile) => p.segments.some((s) => WEB3_SEGMENTS.has(s));

/* ------------------------------------------------------------------ */
/* Step 8: ICP filter                                                  */
/* ------------------------------------------------------------------ */

export function filterServices(profile: Profile, rubrik: Rubrik): ServiceDef[] {
  return rubrik.services.filter((s) => {
    if (profile.segments.some((seg) => s.excludeSegments.includes(seg))) return false;
    if (!profile.segments.some((seg) => s.icpSegments.includes(seg))) return false;
    if (s.requiresB2B && profile.isB2B === false) return false; // unknown B2B → keep
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* Sub-scores (each 0–10)                                              */
/* ------------------------------------------------------------------ */

export function needScore(profile: Profile, service: ServiceDef): number {
  let score = 6; // passed the ICP filter → baseline need
  if (service.hotStages.includes(profile.stage)) score += 3;
  if (service.requiresB2B && profile.isB2B === true) score += 1;
  if (service.category === "web3_code" && (profile.codeLoc ?? 0) > 0) score += 1;
  return clamp(score, 0, 10);
}

const GAP_BY_STATUS: Record<PostureStatus, number> = {
  none: 10, stale: 7, unknown: 6, partial: 5, covered: 1,
};
export const gapScore = (status: PostureStatus) => GAP_BY_STATUS[status];

/**
 * 1.0 at the event, linearly decaying to 0 after `decayDays`.
 * Upcoming events (in the future, inside the window) are treated as maximally urgent,
 * easing slightly the further out they are.
 */
export function recency(occurredAt: string, decayDays: number, now: Date): number {
  const deltaDays = (now.getTime() - new Date(occurredAt).getTime()) / DAY;
  if (Number.isNaN(deltaDays)) return 0;
  if (deltaDays < 0) {
    const until = -deltaDays;
    return until > decayDays ? 0.3 : 1 - (until / decayDays) * 0.3;
  }
  return clamp(1 - deltaDays / decayDays, 0, 1);
}

export function applicableTriggerDefs(rubrik: Rubrik, serviceKey: string): TriggerDef[] {
  return rubrik.triggers.filter((t) => t.services.includes("*") || t.services.includes(serviceKey));
}

export function timingScore(
  triggers: Trigger[], rubrik: Rubrik, serviceKey: string, now: Date,
): { score: number; best?: Trigger } {
  const defs = applicableTriggerDefs(rubrik, serviceKey);
  let best: Trigger | undefined;
  let bestVal = 0;
  for (const t of triggers) {
    const def = defs.find((d) => d.type === t.type);
    if (!def) continue;
    const val = def.weight * recency(t.occurredAt, def.decayDays, now);
    if (val > bestVal) { bestVal = val; best = t; }
  }
  return { score: Math.round(bestVal * 100) / 10, best };
}

/** A trigger counts as verified when its supporting fact is a sourced fact (not an inference). */
export function isVerifiedTrigger(t: Trigger, facts: Fact[]): boolean {
  return t.factIds.some((id) => facts.find((f) => f.id === id)?.kind === "fact");
}

/** Any applicable, still-live trigger backed by a verified fact? (not only the strongest one) */
export function hasLiveVerifiedTrigger(
  triggers: Trigger[], facts: Fact[], rubrik: Rubrik, serviceKey: string, now: Date,
): boolean {
  const defs = applicableTriggerDefs(rubrik, serviceKey);
  return triggers.some((t) => {
    const d = defs.find((x) => x.type === t.type);
    return !!d && recency(t.occurredAt, d.decayDays, now) > 0 && isVerifiedTrigger(t, facts);
  });
}

/** Rough ability-to-pay vs. the service's ticket band. */
const BAND_THRESHOLD_USD: Record<TicketBand, number> = {
  low: 250_000, mid: 2_000_000, high: 10_000_000, custom: 5_000_000,
};
export function payScore(profile: Profile, band: TicketBand): number {
  const capacity = Math.max(profile.fundingUsd ?? 0, (profile.tvlUsd ?? 0) * 0.1);
  if (capacity === 0) return 4; // unknown — neutral-low, not zero
  const ratio = capacity / BAND_THRESHOLD_USD[band];
  if (ratio >= 1) return 10;
  if (ratio >= 0.5) return 7;
  if (ratio >= 0.2) return 5;
  return 2;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
export function reachScore(profile: Profile, service: ServiceDef): number {
  const roles = profile.contacts.map((c) => norm(c.role));
  const hit = (list: string[]) => list.some((r) => roles.some((role) => role.includes(norm(r))));
  if (hit(service.personas.primary)) return profile.contacts.some((c) => c.handle) ? 10 : 8;
  if (hit(service.personas.secondary)) return 6;
  // Verified team members without a matching title are still a way in (intros, champions)
  if (profile.contacts.some((c) => c.affiliation === "strong")) return 5;
  if (profile.contacts.some((c) => c.affiliation === "medium")) return 4;
  return 2;
}

/* ------------------------------------------------------------------ */
/* Confidence (separate from the score)                                */
/* ------------------------------------------------------------------ */

export function confidenceOf(facts: Fact[]): Confidence {
  const verified = facts.filter((f) => f.kind === "fact" && f.sourceUrl && f.confidence >= 0.7);
  const inferences = facts.filter((f) => f.kind === "inference").length;
  const ratio = facts.length ? inferences / facts.length : 1;
  if (verified.length >= 8 && ratio <= 0.3) return "high";
  if (verified.length >= 4 && ratio <= 0.5) return "med";
  return "low";
}

/* ------------------------------------------------------------------ */
/* Step 9: final score                                                 */
/* ------------------------------------------------------------------ */

export interface ScoreInput {
  profile: Profile;
  facts: Fact[];
  triggers: Trigger[];
  posture: Posture[];
  rubrik: Rubrik;
  now: Date;
}

export function scoreService(service: ServiceDef, input: ScoreInput): ServiceScore {
  const { profile, triggers, posture, rubrik, now, facts } = input;
  const { weights, caps } = rubrik.scoring;

  const status = posture.find((p) => p.service === service.key)?.status ?? "unknown";
  const timing = timingScore(triggers, rubrik, service.key, now);

  const sub: SubScores = {
    need: needScore(profile, service),
    gap: gapScore(status),
    timing: timing.score,
    pay: payScore(profile, service.ticketBand),
    reach: reachScore(profile, service),
  };

  const raw =
    sub.need * weights.need + sub.gap * weights.gap + sub.timing * weights.timing +
    sub.pay * weights.pay + sub.reach * weights.reach;

  let final = raw;
  let capApplied: string | undefined;
  if (status === "covered" && final > caps.coveredRecent) {
    final = caps.coveredRecent; capApplied = "covered_recent";
  }
  const hasVerifiedTrigger = hasLiveVerifiedTrigger(triggers, facts, rubrik, service.key, now);
  if (!hasVerifiedTrigger && final > caps.noVerifiedTrigger) {
    final = caps.noVerifiedTrigger; capApplied = capApplied ?? "no_verified_trigger";
  }

  return {
    service: service.key,
    sub,
    raw: Math.round(raw * 100) / 100,
    capApplied,
    final: clamp(Math.round(final), 1, 10),
    confidence: confidenceOf(facts),
  };
}

export function scoreAll(input: ScoreInput): ServiceScore[] {
  return filterServices(input.profile, input.rubrik)
    .map((s) => scoreService(s, input))
    .sort((a, b) => b.final - a.final || b.raw - a.raw);
}

/* ------------------------------------------------------------------ */
/* Deal value estimate (always an inference)                           */
/* ------------------------------------------------------------------ */

export function estimateValueBand(service: ServiceDef, profile: Profile, rubrik: Rubrik): string {
  const { fixedTiers, effortFormula, minimums } = rubrik.pricing;
  const loc = profile.codeLoc;
  if (loc) {
    const tier = fixedTiers.find((t) => t.service === service.key && t.maxLoc && loc <= t.maxLoc);
    if (tier) return `~$${tier.priceUsd.toLocaleString()} (${tier.label})`;
    if (effortFormula?.services.includes(service.key)) {
      const days = Math.ceil(loc / effortFormula.locPerDay);
      const usd = days * effortFormula.dayRateUsd;
      return `~$${usd.toLocaleString()} (${days} effort-days est. from ~${loc} LOC)`;
    }
  }
  const min = minimums[service.key];
  return min ? `${service.ticketBand} ticket (min $${min.toLocaleString()})` : `${service.ticketBand} ticket`;
}
