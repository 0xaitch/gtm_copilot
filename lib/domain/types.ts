import { z } from "zod";

/** Controlled vocabulary for what a project is. Rubrik ICPs reference these. */
export const Segment = z.enum([
  "defi", "dex", "lending", "staking", "rwa", "stablecoin", "launchpad",
  "token_project", "nft", "nft_marketplace", "l1", "l2", "appchain",
  "wallet", "cex", "dapp", "web3_infra",
  "saas", "fintech", "healthtech", "ecommerce", "govtech", "enterprise",
  "other",
]);
export type Segment = z.infer<typeof Segment>;

export const Stage = z.enum(["idea", "testnet", "pre_mainnet", "mainnet", "scaling", "unknown"]);
export type Stage = z.infer<typeof Stage>;

export const Channel = z.enum(["telegram", "email", "linkedin", "x"]);
export type Channel = z.infer<typeof Channel>;

export const TriggerType = z.enum([
  "funding", "testnet_launch", "mainnet_launch", "token_launch", "product_launch",
  "new_security_leader", "partnership", "ecosystem_incident", "own_incident",
  "regulation", "growth_spike", "security_hiring",
]);
export type TriggerType = z.infer<typeof TriggerType>;

export const PostureStatus = z.enum(["covered", "stale", "partial", "none", "unknown"]);
export type PostureStatus = z.infer<typeof PostureStatus>;

export const Confidence = z.enum(["high", "med", "low"]);
export type Confidence = z.infer<typeof Confidence>;

/** Every claim the system makes must trace back to one of these. */
export const Fact = z.object({
  id: z.string(),
  key: z.string(),                       // e.g. "segment", "stage", "audit_report", "funding_round"
  value: z.unknown(),
  kind: z.enum(["fact", "inference"]),
  sourceUrl: z.string().optional(),      // required when kind === "fact"
  quote: z.string().optional(),
  observedAt: z.string().optional(),     // ISO date the fact refers to (e.g. raise date)
  confidence: z.number().min(0).max(1),
});
export type Fact = z.infer<typeof Fact>;

export const Source = z.object({
  id: z.string(),
  url: z.string(),
  kind: z.enum(["page", "x_post", "telegram", "forum", "github", "listing", "news"]),
  fetchedAt: z.string(),
  text: z.string(),
  /** X profile links found on the page (team pages, footers). */
  xLinks: z.array(z.string()).optional(),
});
export type Source = z.infer<typeof Source>;

export const Contact = z.object({
  name: z.string().optional(),
  role: z.string(),
  handle: z.string().optional(),
  channel: Channel.optional(),
  factId: z.string().optional(),
  bio: z.string().optional(),
  /** How sure we are this person works at the project, and why. */
  affiliation: z.enum(["strong", "medium", "weak"]).optional(),
  evidence: z.string().optional(),
  sourceUrl: z.string().optional(),
  followers: z.number().optional(),
});
export type Contact = z.infer<typeof Contact>;

export const Profile = z.object({
  name: z.string().optional(),
  segments: z.array(Segment),
  stage: Stage,
  isB2B: z.boolean().optional(),
  hasToken: z.boolean().optional(),
  fundingUsd: z.number().optional(),
  /** Investor-backed (stated on site/docs) even when no amount is known. */
  backed: z.boolean().optional(),
  lastFundingAt: z.string().optional(),
  tvlUsd: z.number().optional(),
  codeLoc: z.number().optional(),
  languages: z.array(z.string()),
  contacts: z.array(Contact),
});
export type Profile = z.infer<typeof Profile>;

export const Trigger = z.object({
  type: TriggerType,
  occurredAt: z.string(),                // ISO; may be in the future (scheduled launch)
  factIds: z.array(z.string()),
  note: z.string().optional(),
});
export type Trigger = z.infer<typeof Trigger>;

export const Posture = z.object({
  service: z.string(),
  status: PostureStatus,
  lastCoveredAt: z.string().optional(),
  factIds: z.array(z.string()),
});
export type Posture = z.infer<typeof Posture>;

export const SubScores = z.object({
  need: z.number(), gap: z.number(), timing: z.number(), pay: z.number(), reach: z.number(),
});
export type SubScores = z.infer<typeof SubScores>;

export const ServiceScore = z.object({
  service: z.string(),
  sub: SubScores,
  raw: z.number(),                       // weighted 0–10 before caps
  capApplied: z.string().optional(),
  final: z.number().int().min(1).max(10),
  confidence: Confidence,
});
export type ServiceScore = z.infer<typeof ServiceScore>;

export const Thesis = z.object({
  service: z.string(),
  summary: z.string(),
  evidenceFactIds: z.array(z.string()),
  inferences: z.array(z.string()),
  counterSignals: z.array(z.string()),
  unknowns: z.array(z.string()),
  gatePassed: z.boolean().optional(),
  gateReasons: z.array(z.string()).optional(),
});
export type Thesis = z.infer<typeof Thesis>;

export const Priority = z.enum(["A", "B", "C"]);
export type Priority = z.infer<typeof Priority>;

/** Prospecting output per service: who, why now, where to engage, what to find out next. No drafts. */
export const ProspectBrief = z.object({
  service: z.string(),
  priority: Priority,
  entryAngle: z.string(),
  whyNow: z.array(z.object({ text: z.string(), date: z.string().optional(), sourceUrl: z.string().optional() })),
  decisionMakers: z.array(z.object({
    role: z.string(),
    name: z.string().optional(),
    handle: z.string().optional(),
    found: z.boolean(),                  // true = seen in sources; false = role to go find
    affiliation: z.enum(["strong", "medium", "weak"]).optional(),
    evidence: z.string().optional(),
    url: z.string().optional(),
    bio: z.string().optional(),
  })),
  engagePoints: z.array(z.object({ kind: z.string(), url: z.string() })),
  qualificationQuestions: z.array(z.string()),
  researchNext: z.array(z.string()),
  estValueBand: z.string(),
});
export type ProspectBrief = z.infer<typeof ProspectBrief>;

export const InputType = z.enum(["url", "x"]);
export type InputType = z.infer<typeof InputType>;
