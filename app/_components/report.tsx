"use client";

import { useState } from "react";
import type { ProspectBrief, TriggerType } from "@/lib/domain/types";
import { OutreachCard } from "./outreach";
import { PeopleTable } from "./people-table";
import { COVERAGE, describeFact, serviceName, usd, whyNoBrief, type AnalysisResult } from "./types";
import {
  Avatar, Badge, Bar, Button, Card, CardHead, Chip, ExtLink, Icon, IconLink, KindTag, Label,
  PRIORITY_LABEL, PRIORITY_TONE, ScoreRing, scoreColor, xUrl,
} from "./ui";

export interface RunMeta { finishedAt: number; seconds: number; hints: string }

const OTHER = /\s*\(other contact\)$/i;
const UNVERIFIED = /^\(unverified\)\s*/;

export function Report({ res, meta, onRerun }: { res: AnalysisResult; meta: RunMeta; onRerun: () => void }) {
  const firstKey = res.briefs[0]?.service ?? res.scores[0]?.service;
  const [selected, setSelected] = useState(firstKey);
  const active = res.scores.some((s) => s.service === selected) ? selected! : firstKey;
  const brief = res.briefs.find((b) => b.service === active);

  return (
    <div className="flex flex-col gap-5">
      <ReportHeader res={res} meta={meta} onRerun={onRerun} canOutreach={!!brief} />
      <Alerts res={res} />
      {!!res.scores.length && active && <Kpis res={res} service={active} />}

      {!!res.scores.length && active && (
        <div className="grid items-start gap-5 lg:grid-cols-12">
          <div className="flex flex-col gap-5 lg:col-span-8">
            <Services res={res} selected={active} onSelect={setSelected} />
            <Evidence res={res} service={active} />
            {brief && <NextSteps brief={brief} />}
          </div>
          <div className="flex flex-col gap-5 lg:col-span-4">
            <ContactAndOutreach key={active} res={res} service={active} brief={brief} />
          </div>
        </div>
      )}

      {!!res.profile?.contacts.length && <PeopleTable contacts={res.profile.contacts} />}
      <Footer res={res} />
    </div>
  );
}

/* ---------------- header ---------------- */

function ReportHeader({ res, meta, onRerun, canOutreach }: { res: AnalysisResult; meta: RunMeta; onRerun: () => void; canOutreach: boolean }) {
  const p = res.profile;
  const pr = res.project;
  const name = p?.name ?? pr.name ?? pr.domain ?? "Project";
  const top = res.briefs[0];
  const raised = usd(p?.fundingUsd);
  const tags = [
    ...(p?.segments ?? []).map((s) => s.replace(/_/g, " ")),
    ...(p && p.stage !== "unknown" ? [p.stage.replace(/_/g, " ")] : []),
    ...(raised ? [`Raised · ${raised}`] : p?.backed ? ["Investor-backed"] : []),
    ...(p?.tvlUsd ? [`TVL ${usd(p.tvlUsd)}`] : []),
    ...(p?.codeLoc ? [`~${p.codeLoc.toLocaleString()} LOC`] : []),
  ];

  return (
    <div>
      <p className="mb-3 text-right text-sm text-faint">
        Analyzed {agoText(meta.finishedAt)} · {res.sources.length} sources · {meta.seconds}s
      </p>
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{name}</h1>
            {top ? <Badge tone={PRIORITY_TONE[top.priority]}>{PRIORITY_LABEL[top.priority]}</Badge> : res.scores.length ? <Badge>No brief yet</Badge> : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {pr.domain && <span className="mr-1 font-mono text-muted">{pr.domain}</span>}
            {tags.map((t) => <Chip key={t}>{t}</Chip>)}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRerun}><Icon.refresh width={16} height={16} /> Re-run</Button>
          <Button onClick={() => exportMarkdown(res)}><Icon.download width={16} height={16} /> Export report</Button>
          {canOutreach && (
            <Button variant="primary" onClick={() => document.getElementById("outreach")?.scrollIntoView({ behavior: "smooth" })}>
              Review outreach <Icon.arrow width={16} height={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Alerts({ res }: { res: AnalysisResult }) {
  if (!res.halted && !res.warnings?.length) return null;
  return (
    <div className="flex flex-col gap-2 text-sm">
      {res.halted && <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-amber-200"><b>Stopped at {res.halted.stage}:</b> {res.halted.reason}</p>}
      {res.warnings?.map((w) => <p key={w} className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-2 text-amber-200/90">{w}</p>)}
    </div>
  );
}

/* ---------------- KPI cards for the selected service ---------------- */

function Kpis({ res, service }: { res: AnalysisResult; service: string }) {
  const s = res.scores.find((x) => x.service === service)!;
  const b = res.briefs.find((x) => x.service === service);
  const post = res.posture.find((x) => x.service === service);
  const cov = COVERAGE[post?.status ?? "unknown"];
  const live = b?.whyNow.length ?? 0;
  const verified = b?.whyNow.filter((w) => !UNVERIFIED.test(w.text)).length ?? 0;
  const timingWord = s.sub.timing >= 7 ? "Strong" : s.sub.timing >= 4 ? "Some" : "None yet";
  const headline = b ? { A: "Pitch this week", B: "Worth a pitch", C: "Low priority" }[b.priority] : "Not ready to pitch";
  const angle = b ? stripName(b.entryAngle, serviceName(res, service)) : whyNoBrief(res, service);

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.45fr_1fr_1fr_1fr]">
      <Card className="flex items-center gap-5 p-5">
        <ScoreRing score={s.final} size={92} />
        <div className="min-w-0">
          <p className="text-sm text-muted">Priority score · {serviceName(res, service)}</p>
          <p className="text-lg font-semibold">{headline}</p>
          <p className="line-clamp-2 text-sm text-faint" title={angle}>{angle}</p>
        </div>
      </Card>
      <Kpi label="Playbook fit" value={<>{fmt(s.sub.need)}<span className="text-base font-normal text-faint"> /10</span></>} bar={s.sub.need}
        foot={`${(res.profile?.segments ?? []).join(", ") || "segment unknown"} vs this service's ideal customer`} />
      <Kpi label="Buying intent" value={<span className={s.sub.timing >= 7 ? "text-accent" : s.sub.timing >= 4 ? "text-amber-300" : "text-faint"}>{timingWord}</span>}
        bar={s.sub.timing} barColor="bg-amber-300"
        foot={live ? `${live} live trigger${live === 1 ? "" : "s"}${verified < live ? ` · ${verified} verified` : ""}` : "No dated trigger found"} />
      <Kpi label="Coverage gap" value={<span className={cov.tone === "good" ? "text-accent" : cov.tone === "bad" ? "text-rose-300" : "text-ink"}>{cov.label}</span>}
        bar={s.sub.gap} barColor="bg-sky-400" small
        foot={post?.lastCoveredAt ? `Last covered ${post.lastCoveredAt.slice(0, 10)}` : s.capApplied ? capText(s.capApplied) : `Budget ${fmt(s.sub.pay)}/10 · Reach ${fmt(s.sub.reach)}/10`} />
    </div>
  );
}

function Kpi({ label, value, bar, barColor, foot, small }: { label: string; value: React.ReactNode; bar: number; barColor?: string; foot: string; small?: boolean }) {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`${small ? "text-2xl" : "text-4xl"} font-semibold tracking-tight`}>{value}</p>
      <Bar value={bar} color={barColor} />
      <p className="text-sm text-faint">{foot}</p>
    </Card>
  );
}

/* ---------------- recommended services ---------------- */

function Services({ res, selected, onSelect }: { res: AnalysisResult; selected: string; onSelect: (k: string) => void }) {
  return (
    <Card className="p-5">
      <CardHead icon={<Icon.shield />} title="Recommended services"
        note={`Ranked from your playbook · ${res.rubrik?.services.length ?? res.scores.length} services checked`} />
      <ol className="mt-4 flex flex-col gap-2">
        {res.scores.map((s, i) => {
          const b = res.briefs.find((x) => x.service === s.service);
          const on = s.service === selected;
          const line = b ? stripName(b.entryAngle, serviceName(res, s.service)) : whyNoBrief(res, s.service);
          return (
            <li key={s.service}>
              <button onClick={() => onSelect(s.service)} aria-pressed={on}
                className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left transition ${on
                  ? "border-accent/40 bg-accent/[0.06]"
                  : "border-transparent hover:border-line-2 hover:bg-white/[0.02]"}`}>
                <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${on ? "bg-accent text-accent-ink" : "border border-line-2 text-muted"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {serviceName(res, s.service)}
                    {b && <Badge tone={PRIORITY_TONE[b.priority]}>{b.priority}</Badge>}
                  </span>
                  <span className="mt-0.5 block truncate text-sm text-muted" title={line}>{line}</span>
                </span>
                <span className="hidden w-36 sm:block"><Bar value={s.final} /></span>
                <span className={`w-8 text-right text-xl font-semibold tabular-nums ${scoreColor(s.final)}`}>{s.final}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ---------------- why now: evidence ---------------- */

function Evidence({ res, service }: { res: AnalysisResult; service: string }) {
  const b = res.briefs.find((x) => x.service === service);
  const t = res.theses.find((x) => x.service === service);
  const [all, setAll] = useState(false);

  type Row = { kind: "fact" | "inference"; text: string; quote?: string; right?: string; url?: string; conf?: number; more?: number };
  // Why-now triggers first (dated), then supporting facts merged by meaning — one "Raised $175M"
  // row backed by 8 articles, not 8 rows — then the reasoning.
  const facts = new Map<string, Row>();
  for (const f of (t?.evidenceFactIds ?? []).map((id) => res.facts.find((x) => x.id === id))) {
    if (!f || f.key === "trigger") continue; // triggers are listed above with their dates
    const text = describeFact(f);
    const prev = facts.get(text);
    if (prev) {
      prev.more = (prev.more ?? 0) + 1;
      if ((f.confidence ?? 0) > (prev.conf ?? 0)) Object.assign(prev, { url: f.sourceUrl, conf: f.confidence, quote: cleanQuote(f.quote) });
    } else {
      facts.set(text, { kind: f.kind === "inference" ? "inference" : "fact", text, quote: cleanQuote(f.quote), url: f.sourceUrl, conf: f.confidence });
    }
  }
  const rows: Row[] = [
    ...(b?.whyNow ?? []).map((w) => ({
      kind: (UNVERIFIED.test(w.text) ? "inference" : "fact") as Row["kind"],
      text: w.text.replace(UNVERIFIED, ""), right: w.date, url: w.sourceUrl,
    })),
    ...[...facts.values()].sort((a, b2) => Number(b2.kind === "fact") - Number(a.kind === "fact") || (b2.conf ?? 0) - (a.conf ?? 0)),
    ...(t?.inferences ?? []).map((text) => ({ kind: "inference" as const, text })),
  ];
  const shown = all ? rows : rows.slice(0, 6);

  return (
    <Card className="p-5">
      <CardHead icon={<Icon.bolt />} tone="amber" title="Why now: evidence"
        note={<span className="inline-flex items-center gap-2"><KindTag kind="fact" /> sourced <KindTag kind="inference" /> reasoning</span>} />
      {t?.summary && <p className="mt-4 text-sm text-muted">{t.summary}</p>}
      {rows.length ? (
        <ul className="mt-3 divide-y divide-line">
          {shown.map((r, i) => (
            <li key={i} className="flex items-start gap-4 py-3">
              <KindTag kind={r.kind} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{r.text}</span>
                {r.quote && r.quote.toLowerCase() !== r.text.toLowerCase() && (
                  <span className="mt-0.5 block truncate text-sm text-faint" title={r.quote}>&ldquo;{r.quote}&rdquo;</span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-faint">
                {r.url && <ExtLink href={r.url} className="max-w-40 truncate text-faint" title={r.url}>{host(r.url)}</ExtLink>}
                {!!r.more && <span title="More sources say the same">+{r.more}</span>}
                {r.right && <span className="tabular-nums">{r.right}</span>}
                {r.conf != null && <span className="rounded-md border border-line-2 px-1.5 py-0.5 tabular-nums">{Math.round(r.conf * 100)}%</span>}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="mt-4 text-sm text-muted">No evidence recorded for this service.</p>}
      {rows.length > 6 && (
        <button onClick={() => setAll((v) => !v)} className="mt-1 text-sm text-muted hover:text-accent">
          {all ? "Show less" : `Show all ${rows.length}`}
        </button>
      )}
      {!!t?.counterSignals.length && <p className="mt-3 text-sm text-faint"><span className="text-muted">Counter-signals:</span> {t.counterSignals.join(" ")}</p>}
    </Card>
  );
}

/* ---------------- qualify / research next ---------------- */

function NextSteps({ brief: b }: { brief: ProspectBrief }) {
  return (
    <Card className="grid gap-6 p-5 md:grid-cols-2">
      <div>
        <Label>Qualify on the first call</Label>
        <ul className="flex flex-col gap-2 text-[15px]">
          {b.qualificationQuestions.map((q) => <li key={q} className="flex gap-2"><Icon.check width={16} height={16} className="mt-1 shrink-0 text-accent" />{q}</li>)}
        </ul>
      </div>
      <div>
        {!!b.researchNext.length && (
          <>
            <Label>Research next</Label>
            <ul className="mb-5 flex flex-col gap-2 text-[15px] text-muted">{b.researchNext.map((r) => <li key={r}>{r}</li>)}</ul>
          </>
        )}
        <Label>Deal size</Label>
        <p className="text-[15px]">{b.estValueBand}</p>
      </div>
    </Card>
  );
}

/* ---------------- who to contact + outreach ---------------- */

function ContactAndOutreach({ res, service, brief: b }: { res: AnalysisResult; service: string; brief?: ProspectBrief }) {
  const people = (b?.decisionMakers ?? []).filter((d) => d.found);
  const ranked = [...people.filter((d) => !OTHER.test(d.role)), ...people.filter((d) => OTHER.test(d.role))];
  const toFind = (b?.decisionMakers ?? []).filter((d) => !d.found).map((d) => d.role);
  const [pick, setPick] = useState(0);
  const contact = ranked[pick];
  const templates = (res.rubrik?.templates ?? []).filter((t) => t.service === service);
  const name = serviceName(res, service);

  return (
    <>
      <Card className="p-5">
        <CardHead icon={<Icon.user />} tone="sky" title="Who to contact" note={`For: ${name}`} />
        {ranked.length ? (
          <ul className="mt-3 divide-y divide-line" role="radiogroup" aria-label="Pick who the draft is for">
            {ranked.slice(0, 5).map((d, i) => (
              <li key={`${d.name}-${d.handle}`} className="flex items-center gap-3 py-3">
                <button role="radio" aria-checked={i === pick} onClick={() => setPick(i)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={d.name ?? d.handle ?? "?"} />
                  <span className="min-w-0">
                    <span className={`block truncate font-semibold ${i === pick ? "text-accent" : ""}`}>{d.name ?? d.handle} · <span className="font-normal text-ink/80">{d.role.replace(OTHER, "")}</span></span>
                    <span className="block truncate text-sm text-faint" title={d.evidence}>{OTHER.test(d.role) ? "Also on the team" : "Decision maker"}{d.affiliation ? ` · ${d.affiliation} link` : ""}</span>
                  </span>
                </button>
                {d.handle && <IconLink href={xUrl(d.handle)} label={`${d.handle} on X`}><Icon.x width={14} height={14} /></IconLink>}
                {!d.handle && d.url && <IconLink href={d.url} label="Profile">{/github\.com/.test(d.url) ? <Icon.github width={15} height={15} /> : <Icon.globe width={15} height={15} />}</IconLink>}
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-muted">No decision maker found in public sources yet.</p>}
        {!!toFind.length && <p className="mt-2 border-t border-line pt-3 text-sm text-faint">Still to find: <span className="text-muted">{toFind.join(" · ")}</span></p>}
        {!!b?.engagePoints.length && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {b.engagePoints.map((e) => (
              <IconLink key={e.url} href={e.url} label={e.kind}>
                {/telegram|t\.me/i.test(e.kind + e.url) ? <Icon.telegram width={15} height={15} /> : /github/i.test(e.kind) ? <Icon.github width={15} height={15} /> : /^x$/i.test(e.kind) ? <Icon.x width={14} height={14} /> : <Icon.globe width={15} height={15} />}
              </IconLink>
            ))}
          </div>
        )}
      </Card>

      {b ? (
        <OutreachCard templates={templates} serviceName={name}
          project={res.profile?.name ?? res.project.name ?? res.project.domain ?? "your project"}
          contactName={contact?.name ?? contact?.handle} trigger={bestTrigger(res, b)} />
      ) : (
        <Card className="p-5">
          <CardHead icon={<Icon.send />} title="Outreach draft" />
          <p className="mt-4 text-sm text-muted">No draft: {whyNoBrief(res, service)}. Pick a service with a brief, or add hints and re-run.</p>
        </Card>
      )}
    </>
  );
}

/** The trigger behind the brief's lead why-now item, so the draft can mention it. */
function bestTrigger(res: AnalysisResult, b: ProspectBrief): TriggerType | undefined {
  const lead = b.whyNow.find((w) => !UNVERIFIED.test(w.text)) ?? b.whyNow[0];
  if (!lead) return undefined;
  const text = lead.text.replace(UNVERIFIED, "");
  return res.triggers?.find((t) => t.note === text || (t.note && text.includes(t.note.slice(0, 40))))?.type;
}

/* ---------------- footer ---------------- */

function Footer({ res }: { res: AnalysisResult }) {
  return (
    <div className="flex flex-col gap-1 pb-6 text-sm text-faint">
      <p>
        {res.sources.length} sources · {res.facts.length} facts
        {res.project.resolutionConfidence != null && <> · site match {Math.round(res.project.resolutionConfidence * 100)}%</>}
        {res.usage?.x ? <> · X API ≈ ${res.usage.x.estUsd.toFixed(2)}</> : null}
      </p>
      {res.notes?.map((n) => <p key={n}>{n}</p>)}
      {!!res.sources.length && (
        <details>
          <summary className="cursor-pointer select-none hover:text-muted">Sources</summary>
          <ul className="mt-2 columns-1 gap-8 font-mono text-xs md:columns-2">
            {res.sources.map((s) => (
              <li key={s.id} className="truncate"><span className="text-faint">{s.kind}</span> <ExtLink href={s.url}>{s.url.replace(/^https?:\/\//, "")}</ExtLink></li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ---------------- helpers ---------------- */

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const cleanQuote = (q?: string) => q?.replace(/^…|…$/g, "").trim();
const capText = (cap: string) => ({ no_verified_trigger: "Capped: no verified trigger", covered_recent: "Capped: recently covered" }[cap] ?? `Capped (${cap})`);

/** "Penetration Testing — Morpho operates…" → "Morpho operates…" (the service is already named). */
function stripName(angle: string, name: string): string {
  const s = angle.startsWith(`${name} — `) ? angle.slice(name.length + 3) : angle;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function agoText(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`;
}

/** Download a plain-text brief to paste into a CRM or share. */
function exportMarkdown(res: AnalysisResult) {
  const name = res.profile?.name ?? res.project.domain ?? "project";
  const lines = [`# ${name}`, res.project.website ?? "", ""];
  for (const s of res.scores) {
    const b = res.briefs.find((x) => x.service === s.service);
    lines.push(`## ${serviceName(res, s.service)} — ${s.final}/10${b ? ` · Priority ${b.priority}` : ""}`);
    if (!b) { lines.push(`No brief: ${whyNoBrief(res, s.service)}`, ""); continue; }
    lines.push(stripName(b.entryAngle, serviceName(res, s.service)), "", "**Why now**");
    for (const w of b.whyNow) lines.push(`- ${w.date ? `${w.date} ` : ""}${w.text}${w.sourceUrl ? ` (${w.sourceUrl})` : ""}`);
    lines.push("", "**Decision makers**");
    for (const d of b.decisionMakers) lines.push(d.found ? `- ${d.name ?? d.handle} — ${d.role}${d.handle ? ` ${d.handle}` : ""}` : `- To find: ${d.role}`);
    lines.push("", "**Qualify**", ...b.qualificationQuestions.map((q) => `- ${q}`), "", `Deal size: ${b.estValueBand}`, "");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${(res.project.domain ?? name).replace(/[^\w.-]+/g, "-")}-brief.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}
