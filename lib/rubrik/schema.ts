import { z } from "zod";
import { Channel, Segment, Stage, TriggerType } from "@/lib/domain/types";

/**
 * A Rubrik is a tenant's sales playbook as structured config.
 * The engine contains NO vendor-specific content — everything lives here.
 */

export const TicketBand = z.enum(["low", "mid", "high", "custom"]);
export type TicketBand = z.infer<typeof TicketBand>;

export const ServiceCategory = z.enum(["web3_code", "offensive", "compliance", "managed", "advisory"]);

export const ServiceDef = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/),
  name: z.string(),
  category: ServiceCategory,
  ticketBand: TicketBand,
  icpSegments: z.array(Segment).min(1),
  excludeSegments: z.array(Segment).default([]),
  /** Stages where need is highest (boosts the Need sub-score). */
  hotStages: z.array(Stage).default([]),
  /** Only relevant if the project sells to businesses (e.g. SOC 2). */
  requiresB2B: z.boolean().default(false),
  personas: z.object({
    primary: z.array(z.string()).min(1),
    secondary: z.array(z.string()).default([]),
  }),
  /** Preferred outreach channels, in order, per segment family. */
  channels: z.object({
    web3: z.array(Channel).default(["telegram", "x", "email"]),
    web2: z.array(Channel).default(["email", "linkedin"]),
  }).prefault({}),
});
export type ServiceDef = z.infer<typeof ServiceDef>;

export const TriggerDef = z.object({
  type: TriggerType,
  /** 0–1: how strongly this trigger signals buying intent. */
  weight: z.number().min(0).max(1),
  /** Trigger fully decays after this many days. */
  decayDays: z.number().int().positive(),
  /** Service keys this applies to, or ["*"]. */
  services: z.array(z.string()).min(1),
});
export type TriggerDef = z.infer<typeof TriggerDef>;

export const Claim = z.object({
  id: z.string(),
  text: z.string(),
  appliesTo: z.array(z.string()).default(["*"]),
});

export const Template = z.object({
  id: z.string(),
  service: z.string(),
  channel: Channel,
  subject: z.string().optional(),
  body: z.string(),
});

export const Pricing = z.object({
  fixedTiers: z.array(z.object({
    service: z.string(),
    label: z.string(),
    priceUsd: z.number(),
    maxLoc: z.number().optional(),
  })).default([]),
  effortFormula: z.object({
    services: z.array(z.string()),
    dayRateUsd: z.number(),
    locPerDay: z.number().positive(),
    bufferDays: z.tuple([z.number(), z.number()]),
  }).optional(),
  minimums: z.record(z.string(), z.number()).default({}),
}).prefault({});

export const Competitor = z.object({
  name: z.string(),
  strengths: z.string(),
  edge: z.string(),
});

const Weights = z.object({
  need: z.number(), gap: z.number(), timing: z.number(), pay: z.number(), reach: z.number(),
}).refine(
  (w) => Math.abs(w.need + w.gap + w.timing + w.pay + w.reach - 1) < 1e-6,
  { message: "scoring weights must sum to 1" },
);

export const Scoring = z.object({
  weights: Weights.default({ need: 0.3, gap: 0.25, timing: 0.25, pay: 0.1, reach: 0.1 }),
  thesisMinScore: z.number().int().min(1).max(10).default(5),
  /** Priority tiers: A ≥ a, B ≥ b, otherwise C (briefs only exist for score ≥ thesisMinScore). */
  tiers: z.object({ a: z.number().int().default(8), b: z.number().int().default(6) }).prefault({}),
  caps: z.object({
    coveredRecent: z.number().int().default(3),
    noVerifiedTrigger: z.number().int().default(6),
  }).prefault({}),
  /** Months after which an audit/pentest/cert is considered stale. */
  staleAfterMonths: z.number().int().default(12),
}).prefault({});
export type Scoring = z.infer<typeof Scoring>;

export const Rubrik = z.object({
  name: z.string(),
  version: z.number().int().default(1),
  /** Which projects are in scope at all. Out-of-scope projects stop before scoring. */
  scope: z.enum(["web3", "web2", "all"]).default("all"),
  services: z.array(ServiceDef).min(1),
  triggers: z.array(TriggerDef),
  claims: z.array(Claim).default([]),
  templates: z.array(Template).default([]),
  pricing: Pricing,
  competitors: z.array(Competitor).default([]),
  qualification: z.object({ timelineDays: z.number().int().default(90) }).prefault({}),
  scoring: Scoring,
}).superRefine((r, ctx) => {
  const keys = new Set(r.services.map((s) => s.key));
  for (const t of r.triggers) {
    for (const s of t.services) {
      if (s !== "*" && !keys.has(s)) {
        ctx.addIssue({ code: "custom", message: `trigger ${t.type} references unknown service "${s}"` });
      }
    }
  }
});
export type Rubrik = z.infer<typeof Rubrik>;
