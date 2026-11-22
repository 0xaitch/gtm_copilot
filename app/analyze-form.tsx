"use client";

import { useEffect, useRef, useState } from "react";
import { Results } from "./_components/results";
import type { AnalysisResult } from "./_components/types";

async function fetchAnalysis(input: string, hints: string): Promise<AnalysisResult> {
  try {
    const r = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input, ...(hints.trim() ? { hints } : {}) }),
    });
    return (await r.json()) as AnalysisResult;
  } catch (err) {
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
  const inputRef = useRef<HTMLInputElement>(null);

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
    void fetchAnalysis(initialQuery, "").then((r) => { setRes(r); setLoading(false); });
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
    setRes(await fetchAnalysis(q, hints));
    setLoading(false);
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

      {loading && <Loading elapsed={elapsed} input={input} />}
      {res?.error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-600/20 dark:bg-rose-950 dark:text-rose-300">{res.error}</p>}
      {res && !res.error && <Results res={res} />}
      {!res && !loading && <EmptyState />}
    </div>
  );
}

function Loading({ elapsed, input }: { elapsed: number; input: string }) {
  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <p className="text-sm text-zinc-500">
        Researching <b className="text-zinc-700 dark:text-zinc-300">{input}</b> — site, docs, GitHub, news, Farcaster…{" "}
        <span className="tabular-nums">{elapsed}s</span>
        <span className="text-zinc-400"> (usually 15–60s)</span>
      </p>
      <div className="h-16 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
      <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
        <div className="h-48 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
        <div className="h-48 animate-pulse rounded-lg bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>
    </div>
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
