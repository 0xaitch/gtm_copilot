import type { Channel, Fact, Posture, PostureStatus, Profile, ProspectBrief, ServiceScore, Thesis, Trigger } from "@/lib/domain/types";
import type { StageName } from "@/lib/pipeline/types";

export interface OutreachTemplate { id: string; service: string; channel: Channel; subject?: string; body: string }

/** The playbook as the page sees it before any analysis (header pill). */
export interface PlaybookInfo { services: number }

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
  triggers?: Trigger[];
  warnings: string[];
  notes?: string[];
  usage?: { x?: { userReads: number; postReads: number; estUsd: number } };
  halted?: { stage: string; reason: string };
  rubrik?: { thesisMinScore: number; services: { key: string; name: string }[]; templates?: OutreachTemplate[] };
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

/** A fact in plain words ("Raised $175.0M", "Bug bounty program"), whatever page it was scraped from. */
export function describeFact(f: Fact): string {
  const v = f.value as Record<string, unknown> | string | number | boolean | null;
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const words = (s: unknown) => String(s).replace(/_/g, " ");
  switch (f.key) {
    case "segment": return `Segment: ${words(v)}`;
    case "stage": return `Stage: ${words(v)}`;
    case "funding_round":
      return typeof o.amountUsd === "number" ? `Raised ${usd(o.amountUsd)}${o.round ? ` (${o.round})` : ""}` : "Investor-backed";
    case "tvl": return typeof v === "number" ? `TVL ${usd(v)}` : "TVL reported";
    case "audit_report": return o.announced ? "Audit announced" : "Security audit mentioned";
    case "pentest_mention": return "Penetration test mentioned";
    case "compliance_claim": return `Claims ${v === "soc2" ? "SOC 2" : v === "iso27001" ? "ISO 27001" : words(v)}`;
    case "bug_bounty": return "Runs a bug bounty program";
    case "incident": return "Security incident mentioned";
    case "trigger": return `Trigger: ${words(o.type ?? v)}`;
    case "language": return `Written in ${words(v).replace(/^\w/, (c) => c.toUpperCase())}`;
    case "code_activity": return `Last code push ${String(o.lastPushAt ?? "").slice(0, 10)}${o.repo ? ` (${o.repo})` : ""}`;
    case "code_loc": return `~${Number(v).toLocaleString()} lines of contract code`;
    case "has_token": return "Has a token";
    case "b2b": return "Sells to businesses";
    case "chains": return `Chains: ${Array.isArray(v) ? v.join(", ") : words(v)}`;
    default: return `${words(f.key)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
  }
}

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
