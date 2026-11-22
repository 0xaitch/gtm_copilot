import type { ProspectBrief, ServiceScore } from "@/lib/domain/types";
import { COVERAGE, serviceName, whyNoBrief, type AnalysisResult } from "./types";
import { Badge, Card, ExtLink, Label, PRIORITY_TONE, ScoreChip, xUrl } from "./ui";

const SUB: { key: keyof ServiceScore["sub"]; label: string; hint: string }[] = [
  { key: "need", label: "Need", hint: "How well the project fits this service's ideal customer" },
  { key: "gap", label: "Gap", hint: "How uncovered they are today (no audit / stale / partial)" },
  { key: "timing", label: "Timing", hint: "Strength and recency of why-now triggers" },
  { key: "pay", label: "Budget", hint: "Funding / TVL against the deal size" },
  { key: "reach", label: "Reach", hint: "Whether we found decision makers and channels" },
];
const CAP: Record<string, string> = {
  no_verified_trigger: "capped — no verified trigger",
  covered_recent: "capped — recently covered",
};

export function ServiceDetail({ res, service }: { res: AnalysisResult; service: string }) {
  const s = res.scores.find((x) => x.service === service)!;
  const b = res.briefs.find((x) => x.service === service);
  const cov = res.posture.find((x) => x.service === service)?.status ?? "unknown";

  return (
    <Card className="min-w-0">
      <header className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <ScoreChip score={s.final} />
        <h3 className="font-semibold">{serviceName(res, service)}</h3>
        {b && <Badge tone={PRIORITY_TONE[b.priority]}>Priority {b.priority}</Badge>}
        <Badge tone={COVERAGE[cov].tone}>{COVERAGE[cov].label}</Badge>
        <Badge tone={s.confidence === "high" ? "good" : s.confidence === "med" ? "warn" : "muted"}>{s.confidence} confidence</Badge>
        {b && <span className="ml-auto text-sm"><span className="text-zinc-500">Deal size </span>{b.estValueBand}</span>}
      </header>

      <div className="grid gap-5 p-4 text-sm">
        {b ? <Brief brief={b} serviceName={serviceName(res, service)} /> : (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400">
            No outreach brief: {whyNoBrief(res, service)}.
          </p>
        )}
        <ScoreBreakdown score={s} />
        <Evidence res={res} service={service} />
      </div>
    </Card>
  );
}

function Brief({ brief: b, serviceName: name }: { brief: ProspectBrief; serviceName: string }) {
  // "Penetration Testing — Morpho operates in…": the header already names the service
  const angle = b.entryAngle.startsWith(`${name} — `) ? b.entryAngle.slice(name.length + 3) : b.entryAngle;
  return (
    <>
      <p className="font-medium">{angle.charAt(0).toUpperCase() + angle.slice(1)}</p>

      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <Label>Why now</Label>
          {b.whyNow.length ? (
            <ul className="flex flex-col gap-1.5">
              {b.whyNow.map((w) => {
                const unverified = w.text.startsWith("(unverified)");
                return (
                  <li key={w.text} className="flex gap-2">
                    <span className="w-20 shrink-0 tabular-nums text-zinc-500">{w.date ?? "undated"}</span>
                    <span className={unverified ? "text-zinc-500" : ""}>
                      {w.text.replace(/^\(unverified\) /, "")}
                      {unverified && <> <Badge>unverified</Badge></>}
                      {w.sourceUrl && <> <ExtLink href={w.sourceUrl} className="text-xs">source</ExtLink></>}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : <p className="text-zinc-500">No live trigger — cold outreach.</p>}
        </div>

        <DecisionMakers people={b.decisionMakers} />

        <div>
          <Label>Qualify</Label>
          <ul className="list-disc space-y-1 pl-4 marker:text-zinc-400">{b.qualificationQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
        </div>

        <div>
          {!!b.engagePoints.length && (
            <div className="mb-4">
              <Label>Engage via</Label>
              <div className="flex flex-wrap gap-x-3">
                {b.engagePoints.map((e) => <ExtLink key={e.url} href={e.url}>{e.kind}</ExtLink>)}
              </div>
            </div>
          )}
          {!!b.researchNext.length && (
            <>
              <Label>Research next</Label>
              <ul className="list-disc space-y-1 pl-4 text-zinc-600 marker:text-zinc-400 dark:text-zinc-400">{b.researchNext.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}

const OTHER = /\s*\(other contact\)$/i;

/** Decision makers we found, then the roles still to find, then other team contacts in one line. */
function DecisionMakers({ people }: { people: ProspectBrief["decisionMakers"] }) {
  const found = people.filter((d) => d.found && !OTHER.test(d.role));
  const others = people.filter((d) => d.found && OTHER.test(d.role));
  const toFind = people.filter((d) => !d.found).map((d) => d.role);
  return (
    <div>
      <Label>Decision makers</Label>
      {found.length ? (
        <ul className="flex flex-col gap-2">
          {found.map((d) => (
            <li key={`${d.role}-${d.name ?? d.handle ?? ""}`}>
              <div className="flex flex-wrap items-center gap-x-1.5">
                <b>{d.name ?? d.handle}</b>
                <span className="text-zinc-500">{d.role}</span>
                {d.affiliation && <Badge tone={d.affiliation === "strong" ? "good" : "warn"}>{d.affiliation}</Badge>}
                {d.handle ? <ExtLink href={xUrl(d.handle)}>{d.handle}</ExtLink> : d.url && <ExtLink href={d.url}>profile</ExtLink>}
              </div>
              {d.evidence && <p className="text-xs text-zinc-500">{d.evidence}</p>}
            </li>
          ))}
        </ul>
      ) : <p className="text-zinc-500">None found yet.</p>}
      {!!toFind.length && (
        <p className="mt-2"><span className="text-zinc-500">Still to find: </span>{toFind.join(" · ")}</p>
      )}
      {!!others.length && (
        <p className="mt-1 text-xs text-zinc-500">
          Also on the team:{" "}
          {others.map((d, i) => (
            <span key={`${d.name}-${d.handle}`}>
              {i > 0 && ", "}
              {d.handle ? <ExtLink href={xUrl(d.handle)}>{d.name ?? d.handle}</ExtLink>
                : d.url ? <ExtLink href={d.url}>{d.name}</ExtLink> : d.name}
              {" "}({d.role.replace(OTHER, "")})
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

function ScoreBreakdown({ score: s }: { score: ServiceScore }) {
  return (
    <div>
      <Label>
        Score breakdown · {s.raw.toFixed(1)} raw{s.capApplied ? ` · ${CAP[s.capApplied] ?? `capped (${s.capApplied})`}` : ""}
      </Label>
      <div className="grid grid-cols-5 gap-3">
        {SUB.map(({ key, label, hint }) => {
          const v = s.sub[key];
          return (
            <div key={key} title={hint}>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">{label}</span>
                <span className="tabular-nums">{Number.isInteger(v) ? v : v.toFixed(1)}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full rounded-full bg-zinc-700 dark:bg-zinc-300" style={{ width: `${Math.max(0, Math.min(10, v)) * 10}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Evidence({ res, service }: { res: AnalysisResult; service: string }) {
  const t = res.theses.find((x) => x.service === service);
  if (!t) return null;
  const facts = t.evidenceFactIds.map((id) => res.facts.find((f) => f.id === id)).filter((f) => !!f);
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
        Thesis & evidence · {facts.length} facts{t.inferences.length ? `, ${t.inferences.length} inferences` : ""}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <p>{t.summary}</p>
        <ul className="flex flex-col gap-1 text-xs">
          {facts.map((f) => (
            <li key={f.id} className="flex gap-2">
              <Badge tone="good">fact</Badge>
              <span className="min-w-0">
                {f.quote ?? `${f.key}: ${JSON.stringify(f.value)}`}
                {f.sourceUrl && <> <ExtLink href={f.sourceUrl}>source</ExtLink></>}
              </span>
            </li>
          ))}
          {t.inferences.map((i) => (
            <li key={i} className="flex gap-2"><Badge tone="warn">inference</Badge><span className="min-w-0">{i}</span></li>
          ))}
        </ul>
        {!!t.counterSignals.length && <p className="text-xs text-zinc-500"><b>Counter-signals:</b> {t.counterSignals.join(" ")}</p>}
        {!!t.unknowns.length && <p className="text-xs text-zinc-500"><b>Unknowns:</b> {t.unknowns.join(" ")}</p>}
      </div>
    </details>
  );
}
