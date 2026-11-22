import type { Fact, Posture, PostureStatus, Profile, ProspectBrief, ServiceScore, Thesis } from "@/lib/domain/types";
import type { StageName } from "@/lib/pipeline/types";

/** What /api/analyze returns (raw page text stripped). */
export interface AnalysisResult {
  project: {
    name?: string; domain?: string; website?: string; xHandle?: string; github?: string;
    telegram?: string; docs?: string; forum?: string; resolutionConfidence?: number;
  };
  sources: { id: string; url: string; kind: string }[];
  facts: Fact[];
  profile?: Profile;
  posture: Posture[];
  scores: ServiceScore[];
  theses: Thesis[];
  briefs: ProspectBrief[];
  warnings: string[];
  notes?: string[];
  usage?: { x?: { userReads: number; postReads: number; estUsd: number } };
  halted?: { stage: string; reason: string };
  rubrik?: { name: string; thesisMinScore: number; services: { key: string; name: string }[] };
  error?: string;
}

/** Streamed by /api/analyze (stream: true): one line as each pipeline stage starts. */
export interface ProgressEvent {
  type: "progress";
  stage: StageName;
  index: number;          // 0-based position of the stage now starting
  total: number;
  project?: { name?: string; domain?: string };
  counts: { pages: number; facts: number; people: number };
}

/** The pipeline's 15 stages grouped into the steps a rep cares about. */
export const PHASES: { label: string; detail: string; stages: StageName[] }[] = [
  { label: "Finding the project", detail: "website, X handle, DefiLlama, GitHub org", stages: ["resolve"] },
  { label: "Reading the website", detail: "team, docs, security and blog pages", stages: ["discover", "collect"] },
  { label: "Pulling facts", detail: "segments, audits, funding, TVL, code size", stages: ["extract", "enrich", "profile", "filter"] },
  { label: "News and team", detail: "news, Telegram, forum, GitHub, Farcaster", stages: ["social", "people"] },
  { label: "Scoring services", detail: "coverage, why-now triggers, fit", stages: ["posture", "triggers", "score"] },
  { label: "Writing briefs", detail: "thesis, evidence check, outreach brief", stages: ["thesis", "gate", "brief"] },
];

export const usd = (n?: number) =>
  !n ? undefined : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

/** "smart_contract_audit" → the rubrik's display name, or a readable fallback. */
export function serviceName(res: AnalysisResult, key: string): string {
  return res.rubrik?.services.find((s) => s.key === key)?.name
    ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const COVERAGE: Record<PostureStatus, { label: string; tone: Tone }> = {
  none: { label: "No coverage found", tone: "good" },
  stale: { label: "Coverage stale", tone: "good" },
  partial: { label: "Partial coverage", tone: "warn" },
  unknown: { label: "Coverage unknown", tone: "muted" },
  covered: { label: "Already covered", tone: "bad" },
};

export type Tone = "good" | "warn" | "bad" | "muted" | "info";

/** Why a scored service has no brief, in plain words. */
export function whyNoBrief(res: AnalysisResult, key: string): string | undefined {
  if (res.briefs.some((b) => b.service === key)) return undefined;
  const score = res.scores.find((s) => s.service === key);
  const min = res.rubrik?.thesisMinScore ?? 5;
  if (score && score.final < min) return `Score below ${min}`;
  const t = res.theses.find((x) => x.service === key);
  if (t?.gatePassed === false) {
    return (t.gateReasons ?? [])
      .map((r) => (/confidence low/.test(r) ? "Not enough data to be confident" : /no verified/.test(r) ? "No sourced evidence" : r))
      .join(" · ");
  }
  return "No brief";
}
