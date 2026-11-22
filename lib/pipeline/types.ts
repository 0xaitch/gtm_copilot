import type {
  Fact, InputType, Posture, Profile, ProspectBrief, ServiceScore, Source, Thesis, Trigger,
} from "@/lib/domain/types";
import type { Rubrik, ServiceDef } from "@/lib/rubrik/schema";
import type { LLMClient } from "@/lib/ai/client";
import type { Fetcher } from "@/lib/connectors/web";
import type { XClient, XUsage } from "@/lib/connectors/x";

export const STAGES = [
  "resolve", "discover", "collect", "extract", "enrich", "profile", "filter",
  "social", "people", "posture", "triggers", "score", "thesis", "gate", "brief",
] as const;
export type StageName = (typeof STAGES)[number];

/** Everything an analysis accumulates. Each step reads it and returns a patch. */
export interface AnalysisContext {
  input: { raw: string; type?: InputType };
  project: {
    name?: string;
    domain?: string;
    website?: string;
    xHandle?: string;
    xUserId?: string;
    github?: string;
    telegram?: string;
    forum?: string;                  // Discourse base URL, if any
    docs?: string;
    /** Blog feeds and blog pages seen on the homepage (RSS/Atom, Medium, Substack, Mirror…). */
    feeds?: string[];
    blogPages?: string[];
    resolutionConfidence?: number;
  };
  /** Optional extra leads from the user: team X handles and URLs they spotted themselves. */
  hints: { handles: string[]; urls: string[] };
  links: string[];                  // discovered candidate URLs
  sources: Source[];
  facts: Fact[];
  profile?: Profile;
  posture: Posture[];
  triggers: Trigger[];
  candidates: ServiceDef[];
  scores: ServiceScore[];
  theses: Thesis[];
  briefs: ProspectBrief[];
  warnings: string[];
  /** Neutral information (e.g. which optional sources were skipped). */
  notes: string[];
  /** Paid API usage for this analysis (cost transparency). */
  usage: { x?: XUsage };
  /** Set by a step to stop the pipeline early with a user-facing reason. */
  halted?: { stage: StageName; reason: string };
}

export interface StepDeps {
  rubrik: Rubrik;
  fetcher: Fetcher;
  llm: LLMClient | null;            // null → heuristic fallbacks
  x: XClient | null;                // null → no X API (free sources only)
  now: Date;
}

export interface Step {
  name: StageName;
  run(ctx: AnalysisContext, deps: StepDeps): Promise<Partial<AnalysisContext>>;
}

export function emptyContext(raw: string, hints: AnalysisContext["hints"] = { handles: [], urls: [] }): AnalysisContext {
  return {
    input: { raw }, project: {}, hints, links: [], sources: [], facts: [], posture: [],
    triggers: [], candidates: [], scores: [], theses: [], briefs: [], warnings: [], notes: [], usage: {},
  };
}
