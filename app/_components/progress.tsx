import { PHASES, type ProgressEvent } from "./types";
import { Button, Card } from "./ui";

/** Live checklist of the analysis: which step is running, what's done, and what's been found so far. */
export function Progress({ elapsed, input, progress, onCancel }: {
  elapsed: number; input: string; progress: ProgressEvent | null; onCancel: () => void;
}) {
  const current = progress ? PHASES.findIndex((p) => p.stages.includes(progress.stage)) : 0;
  const pct = progress ? Math.round((progress.index / progress.total) * 100) : 2;
  const c = progress?.counts;
  const name = progress?.project?.name ?? progress?.project?.domain;

  return (
    <Card className="mx-auto mt-6 max-w-4xl overflow-hidden">
      <div aria-live="polite" aria-busy="true" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-5">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent shadow-[0_0_12px_rgb(195_242_61/0.8)]" aria-hidden />
        <p className="text-lg">
          Researching <b>{name ?? input}</b>
          {name && progress?.project?.domain && name !== progress.project.domain && <span className="font-mono text-base text-muted"> · {progress.project.domain}</span>}
        </p>
        <span className="tabular-nums text-muted">{elapsed}s <span className="text-faint">· usually 15–60s</span></span>
        <Button onClick={onCancel} className="ml-auto">Cancel</Button>
      </div>
      <div className="h-1 bg-white/5">
        <div className="h-full bg-accent shadow-[0_0_12px_rgb(195_242_61/0.8)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="grid gap-6 px-6 py-6 sm:grid-cols-[1fr_auto]">
        <ol className="flex flex-col gap-3">
          {PHASES.map((p, i) => {
            const state = i < current ? "done" : i === current ? "active" : "todo";
            return (
              <li key={p.label} className="flex items-center gap-3">
                <span aria-hidden className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                  state === "done" ? "bg-accent font-bold text-accent-ink"
                    : state === "active" ? "animate-spin border-2 border-accent border-t-transparent"
                      : "border border-line-2"}`}>
                  {state === "done" ? "✓" : ""}
                </span>
                <span className={state === "todo" ? "text-faint" : state === "active" ? "font-semibold" : "text-ink/90"}>{p.label}</span>
                {state === "active" && <span className="text-sm text-muted">{p.detail}</span>}
                <span className="sr-only">{state === "done" ? "done" : state === "active" ? "in progress" : "pending"}</span>
              </li>
            );
          })}
        </ol>
        <dl className="grid grid-cols-3 gap-3 self-start sm:w-64 sm:grid-cols-1">
          {([["Pages read", c?.pages], ["Facts", c?.facts], ["People", c?.people]] as const).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-bg/60 px-4 py-3">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{v ?? 0}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
