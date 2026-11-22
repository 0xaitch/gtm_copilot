"use client";

import { useState } from "react";
import type { Fact, Posture, Profile, ProspectBrief, ServiceScore, Thesis } from "@/lib/domain/types";

interface Result {
  project: {
    name?: string; domain?: string; website?: string; xHandle?: string; github?: string;
    telegram?: string; docs?: string; resolutionConfidence?: number;
  };
  sources: { id: string; url: string }[];
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
  error?: string;
}

const scoreColor = (n: number) => (n >= 8 ? "bg-emerald-600" : n >= 5 ? "bg-amber-500" : "bg-zinc-400");
const prioColor = { A: "bg-emerald-600", B: "bg-amber-500", C: "bg-zinc-500" } as const;
const usd = (n?: number) =>
  !n ? undefined : n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;

export function AnalyzeForm() {
  const [input, setInput] = useState("");
  const [hints, setHints] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setRes(null);
    try {
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, ...(hints.trim() ? { hints } : {}) }),
      });
      setRes(await r.json());
    } catch (err) {
      setRes({ error: String(err) } as Result);
    } finally {
      setLoading(false);
    }
  }

  const fact = (id: string) => res?.facts.find((f) => f.id === id);

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="project website or @xhandle"
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          disabled={loading || !input.trim()}
          className="rounded-md bg-zinc-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {loading ? "Researching…" : "Analyze"}
        </button>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">
            Add what you know (optional) — team X handles or links you spotted
          </summary>
          <textarea
            value={hints}
            onChange={(e) => setHints(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder={"@janedoe @cto_handle\nhttps://project.xyz/team  https://medium.com/@project/announcing-v2"}
            className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Handles are checked against Farcaster, GitHub and the project&apos;s site like any other lead — shown as
            &ldquo;added by you&rdquo; if nothing confirms them. Links are read as extra pages (up to 10 handles, 5 links).
          </p>
        </details>
      </form>

      {res?.error && <p className="text-red-600">{res.error}</p>}
      {res?.halted && (
        <p className="rounded-md bg-amber-100 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Stopped at <b>{res.halted.stage}</b>: {res.halted.reason}
        </p>
      )}
      {res?.warnings?.map((w) => <p key={w} className="text-sm text-amber-700">⚠ {w}</p>)}
      {res?.notes?.map((n) => <p key={n} className="text-xs text-zinc-500">ℹ {n}</p>)}

      {res?.profile && (
        <section className="rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
          <h2 className="mb-1 text-lg font-semibold">{res.profile.name ?? res.project.domain}</h2>
          <p>
            {res.profile.segments.join(", ")} · stage: {res.profile.stage}
            {res.profile.tvlUsd ? ` · TVL ${usd(res.profile.tvlUsd)}` : ""}
            {res.profile.fundingUsd ? ` · raised ${usd(res.profile.fundingUsd)}` : ""}
            {res.profile.codeLoc ? ` · ~${res.profile.codeLoc.toLocaleString()} contract LOC` : ""}
            {res.profile.languages.length ? ` · ${res.profile.languages.join(", ")}` : ""}
          </p>
          <p className="text-zinc-500">
            {res.sources.length} sources · {res.facts.length} facts · resolution confidence{" "}
            {Math.round((res.project.resolutionConfidence ?? 0) * 100)}%
            {res.usage?.x
              ? ` · X API: ${res.usage.x.userReads} users, ${res.usage.x.postReads} posts ≈ $${res.usage.x.estUsd.toFixed(2)}`
              : " · X API off"}
          </p>
        </section>
      )}

      {!!res?.scores?.length && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">Service likelihood</h3>
          {res.scores.map((s) => {
            const t = res.theses.find((x) => x.service === s.service);
            const b = res.briefs.find((x) => x.service === s.service);
            const posture = res.posture.find((x) => x.service === s.service)?.status;
            return (
              <div key={s.service} className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`rounded px-2 py-1 font-mono text-white ${scoreColor(s.final)}`}>{s.final}/10</span>
                  {b && <span className={`rounded px-2 py-1 text-xs font-bold text-white ${prioColor[b.priority]}`}>Priority {b.priority}</span>}
                  <span className="font-semibold">{s.service}</span>
                  <span className="text-xs text-zinc-500">
                    coverage: {posture} · confidence: {s.confidence}{s.capApplied ? ` · cap: ${s.capApplied}` : ""}
                  </span>
                </div>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  need {s.sub.need} · gap {s.sub.gap} · timing {s.sub.timing} · pay {s.sub.pay} · reach {s.sub.reach}
                </p>

                {b && (
                  <div className="mt-3 grid gap-3 text-sm">
                    <p className="font-medium">{b.entryAngle}</p>

                    {!!b.whyNow.length && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-500">Why now</p>
                        <ul className="list-disc pl-5">
                          {b.whyNow.map((w) => (
                            <li key={w.text}>
                              {w.date && <span className="font-mono text-xs text-zinc-500">{w.date} </span>}
                              {w.text}{" "}
                              {w.sourceUrl && <a className="text-xs underline" href={w.sourceUrl} target="_blank" rel="noreferrer">source</a>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-500">Decision makers</p>
                      <ul className="list-disc pl-5">
                        {b.decisionMakers.map((d) => (
                          <li key={`${d.role}-${d.name ?? d.handle ?? ""}`}>
                            {d.found ? (
                              <>
                                <b>{d.name ?? d.handle}</b> — {d.role}
                                {d.handle && (
                                  <>
                                    {" · "}
                                    <a className="underline" href={`https://x.com/${d.handle.replace(/^@/, "")}`} target="_blank" rel="noreferrer">{d.handle}</a>
                                  </>
                                )}
                                {d.affiliation && (
                                  <span className={`ml-2 rounded px-1 text-xs ${d.affiliation === "strong"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                                    {d.affiliation}
                                  </span>
                                )}
                                {d.evidence && <span className="block text-xs text-zinc-500">{d.evidence}</span>}
                                {d.bio && <span className="block text-xs italic text-zinc-500">“{d.bio}”</span>}
                              </>
                            ) : (
                              <><span className="text-zinc-500">to find:</span> {d.role}</>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {!!b.engagePoints.length && (
                      <p className="text-xs">
                        <span className="font-semibold uppercase text-zinc-500">Engage via </span>
                        {b.engagePoints.map((e, i) => (
                          <span key={e.url}>
                            {i > 0 && " · "}
                            <a className="underline" href={e.url} target="_blank" rel="noreferrer">{e.kind}</a>
                          </span>
                        ))}
                        {" · "}est. value: {b.estValueBand}
                      </p>
                    )}

                    <div>
                      <p className="text-xs font-semibold uppercase text-zinc-500">Qualify</p>
                      <ul className="list-disc pl-5">{b.qualificationQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
                    </div>

                    {!!b.researchNext.length && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-zinc-500">Research next</p>
                        <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-400">{b.researchNext.map((r) => <li key={r}>{r}</li>)}</ul>
                      </div>
                    )}
                  </div>
                )}

                {t && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-zinc-500">Thesis & evidence</summary>
                    <p className="mt-2 text-sm">{t.summary}</p>
                    <ul className="mt-2 list-disc pl-5">
                      {t.evidenceFactIds.map((id) => {
                        const f = fact(id);
                        return f && (
                          <li key={id}>
                            <span className="font-mono text-emerald-700">[FACT]</span> {f.quote ?? `${f.key}: ${JSON.stringify(f.value)}`}{" "}
                            {f.sourceUrl && <a className="underline" href={f.sourceUrl} target="_blank" rel="noreferrer">source</a>}
                          </li>
                        );
                      })}
                      {t.inferences.map((i) => <li key={i}><span className="font-mono text-amber-600">[INFERENCE]</span> {i}</li>)}
                    </ul>
                    {!!t.counterSignals.length && <p className="mt-2 text-zinc-500">Counter-signals: {t.counterSignals.join(" ")}</p>}
                    {t.gatePassed === false && <p className="mt-2 text-red-600">Gate failed: {t.gateReasons?.join("; ")}</p>}
                  </details>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
