/**
 * Step 12 — Brief: prospecting output for each gated thesis.
 * Who to reach, why now (dated + sourced), where to engage, what to qualify, what to research next.
 * Deliberately no outreach drafts.
 */
import { FK } from "@/lib/domain/fact-keys";
import type { Priority, ProspectBrief } from "@/lib/domain/types";
import { applicableTriggerDefs, estimateValueBand, isVerifiedTrigger, recency } from "@/lib/scoring/score";
import type { Step } from "../types";
import { triggerPhrase } from "./thesis";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

const QUESTIONS: Record<string, string[]> = {
  web3_code: [
    "What's changing in the codebase before the next release, and is it already scoped with an auditor?",
    "Who signs off on security vendors — CTO, founders, or a security lead?",
    "What's the launch date the audit has to land before?",
  ],
  offensive: [
    "When was the last independent pentest and what was in scope (web app, APIs, infra, wallets)?",
    "Are partners, exchanges or enterprise customers asking for a pentest report?",
  ],
  compliance: [
    "Are deals or partnerships blocked on a SOC 2 / ISO report today?",
    "Who owns compliance, and is there a target date for the report?",
  ],
  advisory: [
    "Is the token model / vesting final, and who reviews it before launch?",
  ],
  managed: [
    "How is security monitored today, and who responds to incidents?",
  ],
};

export const brief: Step = {
  name: "brief",
  async run(ctx, { rubrik, now }) {
    const p = ctx.profile!;
    const { tiers } = rubrik.scoring;
    const out: ProspectBrief[] = [];

    for (const t of ctx.theses.filter((x) => x.gatePassed)) {
      const svc = rubrik.services.find((s) => s.key === t.service)!;
      const score = ctx.scores.find((s) => s.service === t.service)!;
      const priority: Priority = score.final >= tiers.a ? "A" : score.final >= tiers.b ? "B" : "C";

      // Why now: every applicable, still-live trigger — verified ones first, then by strength
      const defs = applicableTriggerDefs(rubrik, svc.key);
      const live = ctx.triggers
        .map((tr) => {
          const d = defs.find((x) => x.type === tr.type);
          return { tr, v: d ? d.weight * recency(tr.occurredAt, d.decayDays, now) : 0, verified: isVerifiedTrigger(tr, ctx.facts) };
        })
        .filter((x) => x.v > 0)
        .sort((a, b) => Number(b.verified) - Number(a.verified) || b.v - a.v);
      const whyNow: ProspectBrief["whyNow"] = live.map(({ tr, verified }) => {
        const f = ctx.facts.find((x) => x.id === tr.factIds[0]);
        return {
          text: `${verified ? "" : "(unverified) "}${tr.note ?? triggerPhrase(tr)}`,
          date: tr.occurredAt.slice(0, 10),
          sourceUrl: f?.sourceUrl,
        };
      });
      const postureStatus = ctx.posture.find((x) => x.service === svc.key)?.status;
      if (postureStatus === "stale") whyNow.push({ text: "Existing coverage is stale — code or time has moved past it." });
      if (postureStatus === "none") whyNow.push({ text: `No existing ${svc.name.toLowerCase()} found.` });

      // Decision makers: found contacts matching personas first, then roles still to find
      const decisionMakers: ProspectBrief["decisionMakers"] = [];
      for (const role of [...svc.personas.primary, ...svc.personas.secondary]) {
        const c = p.contacts.find((x) => norm(x.role).includes(norm(role)));
        if (c && !decisionMakers.some((d) => d.name === c.name)) {
          decisionMakers.push({ role: c.role, name: c.name, handle: c.handle, found: true, affiliation: c.affiliation, evidence: c.evidence, url: c.sourceUrl, bio: c.bio });
        }
      }
      for (const role of svc.personas.primary.slice(0, 3)) {
        if (!decisionMakers.some((d) => norm(d.role).includes(norm(role)))) decisionMakers.push({ role, found: false });
      }
      // Other people found on the site — possible champions / intros
      for (const c of p.contacts.slice(0, 5)) {
        if (!decisionMakers.some((d) => d.name === c.name)) {
          decisionMakers.push({ role: `${c.role} (other contact)`, name: c.name, handle: c.handle, found: true, affiliation: c.affiliation, evidence: c.evidence, url: c.sourceUrl, bio: c.bio });
        }
      }

      const engagePoints = [
        ctx.project.xHandle && { kind: "X", url: `https://x.com/${ctx.project.xHandle}` },
        ctx.project.telegram && { kind: "Telegram", url: ctx.project.telegram },
        ctx.project.github && { kind: "GitHub", url: ctx.project.github },
        ctx.project.docs && { kind: "Docs", url: ctx.project.docs },
        ctx.project.website && { kind: "Website", url: ctx.project.website },
      ].filter(Boolean) as ProspectBrief["engagePoints"];

      // What we still don't know
      const researchNext: string[] = [];
      if (!p.fundingUsd) {
        researchNext.push(p.backed
          ? "Investor-backed, but round size/date unknown — check announcements for the latest raise."
          : "Funding unknown — check funding databases / announcements (no free source connected).");
      }
      if (!decisionMakers.some((d) => d.found && d.affiliation === "strong")) researchNext.push(`Identify the ${svc.personas.primary[0]} — check the project's X following/affiliates and team page${process.env.X_BEARER_TOKEN ? "" : " (set X_BEARER_TOKEN to automate)"}.`);
      if (postureStatus === "partial") researchNext.push("Open the listed audit/security links to confirm scope and dates.");
      if (svc.category === "web3_code" && !p.codeLoc) researchNext.push("Size the codebase (repo access or scope doc) for a quote.");
      if (!live.length) researchNext.push("No dated trigger — watch for launches, raises or incidents before reaching out.");
      if (!ctx.facts.some((f) => f.key === FK.codeActivity) && svc.category === "web3_code") {
        researchNext.push("No public GitHub activity found — code may be private; ask for scope directly.");
      }

      const best = live[0]?.tr;
      const hedge = live[0] && !live[0].verified ? " (unverified)" : "";
      out.push({
        service: svc.key,
        priority,
        entryAngle: best
          ? `${svc.name} — ${p.name ?? "the project"} ${triggerPhrase(best)}${hedge}${postureStatus === "stale" ? "; existing coverage is stale" : postureStatus === "none" ? "; no existing coverage found" : ""}.`
          : `${svc.name} — coverage gap (${postureStatus ?? "unknown"}).`,
        whyNow,
        decisionMakers,
        engagePoints,
        qualificationQuestions: [...(QUESTIONS[svc.category] ?? []), ...t.unknowns].filter((q, i, a) => a.indexOf(q) === i),
        researchNext,
        estValueBand: estimateValueBand(svc, p, rubrik),
      });
    }

    out.sort((a, b) => a.priority.localeCompare(b.priority));
    return { briefs: out };
  },
};
