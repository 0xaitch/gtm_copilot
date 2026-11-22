"use client";

import { useEffect, useRef, useState } from "react";
import { Landing } from "./_components/landing";
import { Progress } from "./_components/progress";
import { Report, type RunMeta } from "./_components/report";
import { SearchBar } from "./_components/search-bar";
import type { AnalysisResult, PlaybookInfo, ProgressEvent } from "./_components/types";
import { Icon } from "./_components/ui";

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

export function AnalyzeForm({ initialQuery, playbook }: { initialQuery?: string; playbook?: PlaybookInfo }) {
  const [input, setInput] = useState(initialQuery ?? "");
  const [hints, setHints] = useState("");
  const [showHints, setShowHints] = useState(false);
  const [loading, setLoading] = useState(!!initialQuery);
  const [elapsed, setElapsed] = useState(0);
  const [res, setRes] = useState<AnalysisResult | null>(null);
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function run(q: string, h: string) {
    const ac = new AbortController();
    abortRef.current = ac;
    const t0 = Date.now();
    const r = await fetchAnalysis(q, h, setProgress, ac.signal);
    if (abortRef.current !== ac) return; // superseded or cancelled
    abortRef.current = null;
    setRes(r);
    setMeta({ finishedAt: Date.now(), seconds: Math.round((Date.now() - t0) / 1000), hints: h });
    setLoading(false);
  }

  function start(q: string, h = hints) {
    const query = q.trim();
    if (!query || loading) return;
    setInput(query);
    const url = new URL(window.location.href);
    url.searchParams.set("q", query);
    window.history.replaceState(null, "", url); // keep the address bar shareable
    setLoading(true);
    setElapsed(0);
    setRes(null);
    setProgress(null);
    setCancelled(false);
    setShowHints(false);
    window.scrollTo({ top: 0 });
    void run(query, h);
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setProgress(null);
    setCancelled(true);
  }

  function home() {
    if (loading) cancel();
    setRes(null);
    setCancelled(false);
    setInput("");
    window.history.replaceState(null, "", window.location.pathname);
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

  const landing = !loading && !res;
  const hintsCtl = { active: !!hints.trim(), open: showHints, toggle: () => setShowHints((v) => !v) };
  const hintsBox = showHints && (
    <div className="mt-3">
      <textarea value={hints} onChange={(e) => setHints(e.target.value)} maxLength={2000} rows={2} aria-label="Hints"
        placeholder={"@janedoe @cto_handle  https://project.xyz/team  https://medium.com/@project/announcing-v2"}
        className="w-full rounded-xl border border-line-2 bg-bg/70 px-4 py-3 font-mono text-sm outline-none placeholder:text-faint focus:border-accent/50" />
      <p className="mt-1.5 text-sm text-faint">
        Team X handles or links you spotted. Handles are checked like any other lead and marked &ldquo;added by you&rdquo; if
        nothing confirms them; links are read as extra pages. Up to 10 handles and 5 links.
      </p>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[90rem] items-center gap-6 px-6 py-3.5">
          <button onClick={home} className="flex shrink-0 items-center gap-3" aria-label="New search">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink"><Icon.shieldCheck width={20} height={20} /></span>
            <span className="text-lg font-semibold tracking-tight">Security GTM Copilot</span>
          </button>
          {!landing && (
            <div className="hidden max-w-2xl flex-1 md:block">
              <SearchBar size="sm" value={input} onChange={setInput} onSubmit={() => start(input)} loading={loading} inputRef={inputRef} />
            </div>
          )}
          {playbook && (
            <span className="ml-auto hidden items-center gap-2 rounded-full border border-line-2 px-4 py-1.5 text-sm text-muted sm:inline-flex"
              title="Services, triggers, buyer roles and templates come from this playbook">
              <span className="h-2 w-2 rounded-full bg-accent" /> Playbook loaded · {playbook.services} services
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 px-6 py-6">
        {landing && (
          <>
            {cancelled && <p className="mx-auto max-w-6xl pt-6 text-muted">Analysis cancelled.</p>}
            <Landing
              search={<SearchBar size="lg" value={input} onChange={setInput} onSubmit={() => start(input)} loading={loading} inputRef={inputRef} hints={hintsCtl} />}
              hintsBox={hintsBox}
              onTry={(q) => start(q, "")}
            />
          </>
        )}
        {loading && <Progress elapsed={elapsed} input={input} progress={progress} onCancel={cancel} />}
        {res?.error && (
          <p className="mx-auto mt-6 max-w-4xl rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-3 text-rose-200">{res.error}</p>
        )}
        {res && !res.error && meta && <Report res={res} meta={meta} onRerun={() => start(input, meta.hints)} />}
      </main>
    </div>
  );
}
