"use client";

import { useEffect, useRef, useState } from "react";
import { Results } from "./_components/results";
import { PHASES, type AnalysisResult, type ProgressEvent } from "./_components/types";

/**
 * Runs an analysis, streaming one progress line per pipeline stage, then the result.
 * Returns null if it was cancelled.
 */
async function fetchAnalysis(
  input: string, hints: string, onProgress: (p: ProgressEvent) => void, signal: AbortSignal,
): Promise<AnalysisResult | null> {
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, stream: true, ...(hints.trim() ? { hints } : {}) }),
      signal,
    });
    if (!r.ok || !r.body) return (await r.json().catch(() => ({ error: `Request failed (${r.status})` }))) as AnalysisResult;
    const reader = r.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const msg = JSON.parse(line) as ProgressEvent | { type: "result"; result: AnalysisResult };
        if (msg.type === "progress") onProgress(msg);
        else return msg.result;
      }
    }
    return { error: "The analysis stopped before finishing — try again." } as AnalysisResult;
  } catch (err) {
    if (signal.aborted) return null;
    return { error: String(err) } as AnalysisResult;
  }
}

export function AnalyzeForm({ initialQuery }: { initialQuery?: string }) {
  const [input, setInput] = useState(initialQuery ?? "");
  const [hints, setHints] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [loading, setLoading] = useState(!!initialQuery);
  const [elapsed, setElapsed] = useState(0);
  const [res, setRes] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(q: string, h: string) {
    const ac = new AbortController();
    abortRef.current = ac;
    const r = await fetchAnalysis(q, h, setProgress, ac.signal);
    if (abortRef.current !== ac) return; // superseded
    abortRef.current = null;
    setRes(r);
    setLoading(false);
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setProgress(null);
    setCancelled(true);
  }

  // "/" jumps to the search box from anywhere (unless you're already typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  // A ?q= link starts its analysis on load (loading already starts true for it). The ref keeps
  // React's dev double-run of effects from starting a second, quota-spending analysis.
  const started = useRef(false);
  useEffect(() => {
    if (!initialQuery || started.current) return;
    started.current = true;
    void run(initialQuery, "");
  }, [initialQuery]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q || loading) return;
    const url = new URL(window.location.href);
    url.searchParams.set("q", q);
    window.history.replaceState(null, "", url); // keep the address bar shareable
    setLoading(true);
    setElapsed(0);
    setRes(null);
    setProgress(null);
    setCancelled(false);
    await run(q, hints);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Project website or @xhandle"
              aria-label="Project website or X handle"
              autoFocus
              className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-3 pr-10 text-sm shadow-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-zinc-100/10"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-300 px-1.5 text-[10px] text-zinc-400 dark:border-zinc-700">/</kbd>
          </div>
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            aria-expanded={showHints}
            className={`rounded-md border px-3 text-sm ${showHints || hints.trim()
              ? "border-zinc-500 text-zinc-900 dark:text-zinc-100"
              : "border-zinc-300 text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:text-zinc-400"}`}
          >
            Hints{hints.trim() ? " •" : ""}
          </button>
          <button
            disabled={loading || !input.trim()}
            className="rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {loading ? "Researching…" : "Analyze"}
          </button>
        </div>
        {showHints && (
          <div>
            <textarea
              value={hints}
              onChange={(e) => setHints(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder={"@janedoe @cto_handle  https://project.xyz/team  https://medium.com/@project/announcing-v2"}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
            <p className="text-xs text-zinc-500">
              Team X handles or links you spotted. Handles are checked like any other lead and marked &ldquo;added by you&rdquo; if
              nothing confirms them; links are read as extra pages. Up to 10 handles and 5 links.
            </p>
          </div>
        )}
      </form>

      {loading && <Progress elapsed={elapsed} input={input} progress={progress} onCancel={cancel} />}
      {cancelled && !loading && !res && <p className="text-sm text-zinc-500">Analysis cancelled.</p>}
      {res?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300">{res.error}</p>}
      {res && !res.error && <Results res={res} />}
      {!res && !loading && !cancelled && <EmptyState />}
    </div>
  );
}

/** Live checklist of the analysis: which step is running, what's done, and what's been found so far. */
function Progress({ elapsed, input, progress, onCancel }: {
  elapsed: number; input: string; progress: ProgressEvent | null; onCancel: () => void;
}) {
  const current = progress ? PHASES.findIndex((p) => p.stages.includes(progress.stage)) : 0;
  const pct = progress ? Math.round((progress.index / progress.total) * 100) : 0;
  const c = progress?.counts;
  const name = progress?.project?.name ?? progress?.project?.domain;

  return (
    <section aria-live="polite" aria-busy="true" className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" aria-hidden />
        <p className="text-sm">
          Researching <b>{name ?? input}</b>
          {name && progress?.project?.domain && name !== progress.project.domain && <span className="text-zinc-500"> · {progress.project.domain}</span>}
        </p>
        <span className="text-sm tabular-nums text-zinc-500">{elapsed}s <span className="text-zinc-400">· usually 15–60s</span></span>
        <button type="button" onClick={onCancel} className="ml-auto rounded-md border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100">
          Cancel
        </button>
      </div>
      <div className="h-0.5 bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full bg-sky-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="grid gap-4 px-4 py-3 sm:grid-cols-[1fr_auto]">
        <ol className="flex flex-col gap-1.5 text-sm">
          {PHASES.map((p, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={p.label} className="flex items-baseline gap-2.5">
                <span aria-hidden className={`inline-flex h-4 w-4 shrink-0 translate-y-0.5 items-center justify-center rounded-full text-[10px] ${
                  state === "done" ? "bg-emerald-600 text-white"
                    : state === "active" ? "border-2 border-sky-500 border-t-transparent animate-spin"
                      : "border border-zinc-300 dark:border-zinc-700"}`}>
                  {state === "done" ? "✓" : ""}
                </span>
                <span className={state === "todo" ? "text-zinc-400" : state === "active" ? "font-medium" : ""}>{p.label}</span>
                {state === "active" && <span className="text-xs text-zinc-500">{p.detail}</span>}
                <span className="sr-only">{state === "done" ? "done" : state === "active" ? "in progress" : "pending"}</span>
              </li>
            );
          })}
        </ol>
        <dl className="flex gap-5 self-start text-sm sm:flex-col sm:gap-1.5 sm:text-right">
          {([["Pages read", c?.pages], ["Facts", c?.facts], ["People", c?.people]] as const).map(([k, v]) => (
            <div key={k} className="flex items-baseline gap-1.5 sm:justify-end">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="min-w-6 font-semibold tabular-nums">{v ?? 0}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 px-6 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">Paste a project to research</p>
      <p className="mt-1">
        A website (<span className="font-mono">morpho.org</span>) or X handle (<span className="font-mono">@pendle_fi</span>). You get the
        best service to pitch, why now, who to contact, and the evidence behind each score.
      </p>
    </div>
  );
}
