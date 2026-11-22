"use client";

import { useState } from "react";
import { PeopleTable } from "./people-table";
import { ServiceDetail } from "./service-detail";
import { COVERAGE, serviceName, usd, whyNoBrief, type AnalysisResult } from "./types";
import { Badge, Card, ExtLink, PRIORITY_TONE, ScoreChip, xUrl } from "./ui";

export function Results({ res }: { res: AnalysisResult }) {
  const firstKey = res.briefs[0]?.service ?? res.scores[0]?.service;
  const [selected, setSelected] = useState(firstKey);
  const active = res.scores.some((s) => s.service === selected) ? selected : firstKey;

  return (
    <div className="flex flex-col gap-4">
      <ProjectStrip res={res} />
      <Alerts res={res} />
      {!!res.scores.length && <LeadWith res={res} onOpen={setSelected} />}

      {!!res.scores.length && (
        <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
          <ServiceList res={res} selected={active} onSelect={setSelected} />
          {active && <ServiceDetail res={res} service={active} />}
        </div>
      )}

      {!!res.profile?.contacts.length && <PeopleTable contacts={res.profile.contacts} />}
      <Footer res={res} />
    </div>
  );
}

/* ---------------- project summary ---------------- */

function ProjectStrip({ res }: { res: AnalysisResult }) {
  const p = res.profile;
  const pr = res.project;
  const name = p?.name ?? pr.name ?? pr.domain ?? "Project";
  const raised = usd(p?.fundingUsd);
  const metrics: [string, string][] = [
    ...(p?.tvlUsd ? [["TVL", usd(p.tvlUsd)!] as [string, string]] : []),
    ...(raised ? [["Raised", `${raised}${p?.lastFundingAt ? ` · ${p.lastFundingAt.slice(0, 7)}` : ""}`] as [string, string]]
      : p?.backed ? [["Funding", "Investor-backed"] as [string, string]] : []),
    ...(p?.codeLoc ? [["Contract code", `~${p.codeLoc.toLocaleString()} LOC`] as [string, string]] : []),
    ...(p?.languages.length ? [["Languages", p.languages.join(", ")] as [string, string]] : []),
  ];
  const links: [string, string][] = [
    ...(pr.website ? [["Site", pr.website] as [string, string]] : []),
    ...(pr.xHandle ? [["X", xUrl(pr.xHandle)] as [string, string]] : []),
    ...(pr.github ? [["GitHub", pr.github] as [string, string]] : []),
    ...(pr.telegram ? [["Telegram", pr.telegram] as [string, string]] : []),
    ...(pr.docs ? [["Docs", pr.docs] as [string, string]] : []),
    ...(pr.forum ? [["Forum", pr.forum] as [string, string]] : []),
  ];

  return (
    <Card className="px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{name}</h2>
        {pr.domain && <span className="text-sm text-zinc-500">{pr.domain}</span>}
        <div className="flex flex-wrap gap-1">
          {p?.segments.map((s) => <Badge key={s}>{s.replace(/_/g, " ")}</Badge>)}
          {p && p.stage !== "unknown" && <Badge tone="info">{p.stage.replace(/_/g, " ")}</Badge>}
          {p?.isB2B && <Badge>B2B</Badge>}
          {p?.hasToken && <Badge>token</Badge>}
        </div>
        <div className="ml-auto flex flex-wrap gap-x-3 text-sm">
          {links.map(([k, href]) => <ExtLink key={k} href={href}>{k}</ExtLink>)}
        </div>
      </div>
      {!!metrics.length && (
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {metrics.map(([k, v]) => (
            <div key={k} className="flex gap-1.5">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="font-medium tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

function Alerts({ res }: { res: AnalysisResult }) {
  if (!res.halted && !res.warnings?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      {res.halted && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 ring-1 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-200">
          <b>Stopped at {res.halted.stage}:</b> {res.halted.reason}
        </p>
      )}
      {res.warnings?.map((w) => (
        <p key={w} className="rounded-md bg-amber-50 px-3 py-1.5 text-amber-900 ring-1 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-200">{w}</p>
      ))}
    </div>
  );
}

/* ---------------- the one-line answer: what to pitch, why now, to whom ---------------- */

function LeadWith({ res, onOpen }: { res: AnalysisResult; onOpen: (key: string) => void }) {
  const b = res.briefs[0];
  if (!b) {
    const top = res.scores[0];
    return (
      <Card className="flex items-center gap-3 px-4 py-3 text-sm">
        <ScoreChip score={top.final} />
        <div>
          <p className="font-medium">No service clears the bar for outreach yet.</p>
          <p className="text-zinc-500">
            Best fit: {serviceName(res, top.service)} — {whyNoBrief(res, top.service)}.
          </p>
        </div>
      </Card>
    );
  }
  const score = res.scores.find((s) => s.service === b.service)!;
  const contact = b.decisionMakers.find((d) => d.found && d.affiliation === "strong") ?? b.decisionMakers.find((d) => d.found);
  const trigger = b.whyNow.find((w) => !w.text.startsWith("(unverified)")) ?? b.whyNow[0];

  return (
    <Card className="border-l-4 border-l-emerald-600 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <ScoreChip score={score.final} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Lead with</span>
            <button onClick={() => onOpen(b.service)} className="font-semibold hover:underline">{serviceName(res, b.service)}</button>
            <Badge tone={PRIORITY_TONE[b.priority]}>Priority {b.priority}</Badge>
            <span className="text-sm"><span className="text-zinc-500">Deal size </span>{b.estValueBand}</span>
          </div>
          <div className="mt-1 grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
            <p className="truncate" title={trigger?.text}>
              <span className="text-zinc-500">Why now: </span>
              {trigger ? <>{trigger.date && <span className="tabular-nums text-zinc-500">{trigger.date} · </span>}{trigger.text.replace(/^\(unverified\) /, "")}</> : <span className="text-zinc-500">no dated trigger</span>}
            </p>
            <p className="truncate">
              <span className="text-zinc-500">Contact: </span>
              {contact ? (
                <>
                  <b>{contact.name ?? contact.handle}</b> · {contact.role}
                  {contact.handle && <> · <ExtLink href={xUrl(contact.handle)}>{contact.handle}</ExtLink></>}
                </>
              ) : (
                <span className="text-zinc-500">find a {b.decisionMakers[0]?.role ?? "decision maker"}</span>
              )}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- service list ---------------- */

function ServiceList({ res, selected, onSelect }: { res: AnalysisResult; selected?: string; onSelect: (k: string) => void }) {
  return (
    <Card className="self-start overflow-hidden">
      <h3 className="border-b border-zinc-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
        Services · {res.scores.length}
      </h3>
      <ul role="listbox" aria-label="Services">
        {res.scores.map((s) => {
          const b = res.briefs.find((x) => x.service === s.service);
          const cov = res.posture.find((x) => x.service === s.service)?.status ?? "unknown";
          const on = s.service === selected;
          return (
            <li key={s.service} role="option" aria-selected={on}>
              <button
                onClick={() => onSelect(s.service)}
                className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2 text-left text-sm ${on
                  ? "border-l-zinc-900 bg-zinc-100 dark:border-l-zinc-100 dark:bg-zinc-800"
                  : "border-l-transparent hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
              >
                <ScoreChip score={s.final} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-snug">{serviceName(res, s.service)}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {b ? COVERAGE[cov].label : whyNoBrief(res, s.service)}
                  </span>
                </span>
                {b && <Badge tone={PRIORITY_TONE[b.priority]}>{b.priority}</Badge>}
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------------- footer: notes + sources ---------------- */

function Footer({ res }: { res: AnalysisResult }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-zinc-500">
      <p>
        {res.sources.length} sources · {res.facts.length} facts
        {res.project.resolutionConfidence != null && <> · site match {Math.round(res.project.resolutionConfidence * 100)}%</>}
        {res.usage?.x ? <> · X API ≈ ${res.usage.x.estUsd.toFixed(2)}</> : null}
        {res.rubrik && <> · playbook: {res.rubrik.name}</>}
      </p>
      {res.notes?.map((n) => <p key={n}>{n}</p>)}
      {!!res.sources.length && (
        <details>
          <summary className="cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-300">Sources</summary>
          <ul className="mt-1 columns-1 gap-6 md:columns-2">
            {res.sources.map((s) => (
              <li key={s.id} className="truncate">
                <span className="text-zinc-400">{s.kind}</span> <ExtLink href={s.url}>{s.url.replace(/^https?:\/\//, "")}</ExtLink>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
