/**
 * Step 10 — Thesis: why this project needs this service now, grounded in facts.
 * Only for services scoring ≥ rubrik.scoring.thesisMinScore.
 */
import { z } from "zod";
import type { Fact, Thesis, Trigger } from "@/lib/domain/types";
import { timingScore } from "@/lib/scoring/score";
import type { AnalysisContext, Step, StepDeps } from "../types";
import { FK } from "@/lib/domain/fact-keys";

const TRIGGER_PHRASE: Record<string, string> = {
  funding: "recently raised",
  testnet_launch: "is live on testnet",
  mainnet_launch: "is approaching / launching mainnet",
  token_launch: "has a token launch coming",
  product_launch: "shipped a new product",
  new_security_leader: "has a new security/tech leader",
  partnership: "announced a partnership",
  ecosystem_incident: "operates in an ecosystem with a recent incident",
  own_incident: "had a security incident",
  regulation: "faces new regulation",
  growth_spike: "is growing fast",
  security_hiring: "is hiring for security",
};
export const triggerPhrase = (t?: Trigger) => (t ? TRIGGER_PHRASE[t.type] ?? t.type : "");

function relevantFacts(ctx: AnalysisContext, service: string, best?: Trigger): Fact[] {
  const ids = new Set<string>([
    ...(best?.factIds ?? []),
    ...(ctx.posture.find((p) => p.service === service)?.factIds ?? []),
  ]);
  return ctx.facts.filter((f) =>
    ids.has(f.id) || ([FK.segment, FK.stage, FK.funding, FK.tvl, FK.codeActivity] as string[]).includes(f.key));
}

function heuristicThesis(ctx: AnalysisContext, deps: StepDeps, service: string): Thesis {
  const svc = deps.rubrik.services.find((s) => s.key === service)!;
  const { best } = timingScore(ctx.triggers, deps.rubrik, service, deps.now);
  const post = ctx.posture.find((p) => p.service === service)?.status ?? "unknown";
  const facts = relevantFacts(ctx, service, best);
  const p = ctx.profile!;

  const gapText = {
    none: `no existing ${svc.name.toLowerCase()} found`,
    stale: `existing coverage looks stale`,
    partial: `only partial / undated coverage found`,
    unknown: `coverage unknown`,
    covered: `already appears covered`,
  }[post];

  return {
    service,
    summary: `${p.name ?? "This project"} (${p.segments.join(", ")}, stage: ${p.stage})${best ? ` ${triggerPhrase(best)},` : ""} — ${gapText}.`,
    evidenceFactIds: facts.filter((f) => f.kind === "fact").map((f) => f.id),
    inferences: facts.filter((f) => f.kind === "inference").map((f) => f.quote ?? `${f.key}: ${JSON.stringify(f.value)}`),
    counterSignals: [
      ...(post === "covered" || post === "partial" ? ["Existing coverage found — may rehire incumbent vendor."] : []),
      ...(!p.fundingUsd ? ["No funding data — budget unverified."] : []),
    ],
    unknowns: ["Is an engagement already booked?", "Who owns the budget and what's the timeline?"],
  };
}

const LlmThesis = z.object({
  summary: z.string(),
  evidenceFactIds: z.array(z.string()),
  inferences: z.array(z.string()),
  counterSignals: z.array(z.string()),
  unknowns: z.array(z.string()),
});

export const thesis: Step = {
  name: "thesis",
  async run(ctx, deps) {
    const min = deps.rubrik.scoring.thesisMinScore;
    const out: Thesis[] = [];
    for (const s of ctx.scores.filter((x) => x.final >= min)) {
      if (!deps.llm) { out.push(heuristicThesis(ctx, deps, s.service)); continue; }
      const { best } = timingScore(ctx.triggers, deps.rubrik, s.service, deps.now);
      const facts = relevantFacts(ctx, s.service, best);
      const r = await deps.llm.generateObject({
        system: "Write a 2–3 sentence sales thesis. Use ONLY the provided facts; cite them by id in evidenceFactIds. No hype, no fear-mongering.",
        prompt: JSON.stringify({ service: s.service, score: s, profile: ctx.profile, facts }),
        schema: LlmThesis,
      });
      out.push({ service: s.service, ...r });
    }
    return { theses: out };
  },
};
