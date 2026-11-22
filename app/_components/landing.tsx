import type { ReactNode } from "react";
import { Avatar, Badge, Bar, Card, Icon } from "./ui";

/** Hero + "what you'll get" preview. The search box itself is passed in as `search`. */
export function Landing({ search, hintsBox, onTry }: { search: ReactNode; hintsBox?: ReactNode; onTry: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-6xl pb-16 pt-10 sm:pt-16">
      <p className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.06] px-4 py-1.5 text-sm text-accent">
        <span className="h-2 w-2 rounded-full bg-accent" /> Prospect research, scored against your playbook
      </p>
      <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
        Which service to pitch,<br />why now, <span className="text-ink/45">and to whom.</span>
      </h1>
      <p className="mt-6 max-w-3xl text-xl leading-relaxed text-muted">
        Drop a project&apos;s website or X handle. Get the best-fit service, the buying trigger, and the right
        decision-maker, with evidence behind every score.
      </p>

      <div className="mt-10">{search}</div>
      {hintsBox}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-muted">Try</span>
        {["morpho.org", "@pendle_fi", "eigenlayer.xyz"].map((q) => (
          <button key={q} onClick={() => onTry(q)} className="rounded-lg border border-line-2 px-3 py-1.5 font-mono text-sm text-ink/90 hover:border-accent/50 hover:text-accent">{q}</button>
        ))}
      </div>

      <div className="mt-16 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted">What you&apos;ll get</h2>
        <span className="text-sm text-faint">Preview · sample report</span>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <SampleCard icon={<Icon.shield />} title="Best service to pitch">
          <p className="mt-5 text-2xl font-semibold">Smart contract audit: v2 vaults</p>
          <p className="mt-4"><span className="text-5xl font-bold text-accent">8</span><span className="text-xl text-faint"> / 10 fit</span></p>
          <div className="mt-4"><Bar value={8} /></div>
          <div className="mt-5 flex flex-wrap gap-2">{["Playbook fit", "Live trigger", "No audit for v2"].map((t) => <Badge key={t}>{t}</Badge>)}</div>
        </SampleCard>
        <SampleCard icon={<Icon.bolt />} title="Why now" tone="amber">
          <ul className="mt-3 divide-y divide-line">
            {[["New vault contracts pushed to public repo", "2d ago"], ["Mainnet launch teased on X", "5d ago"], ["Last audit predates v2 codebase", "inferred"]].map(([t, d], i) => (
              <li key={t} className="flex gap-3 py-3">
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${i < 2 ? "bg-amber-300" : "bg-faint"}`} />
                <span className="flex-1 text-[15px]">{t}</span>
                <span className="text-sm text-faint">{d}</span>
              </li>
            ))}
          </ul>
        </SampleCard>
        <SampleCard icon={<Icon.user />} title="Who to contact" tone="sky">
          <ul className="mt-3 divide-y divide-line">
            {[["Co-founder & CTO", "@handle · Telegram", "strong"], ["Smart contract lead", "GitHub · X", "medium"]].map(([r, s, a]) => (
              <li key={r} className="flex items-center gap-3 py-3">
                <Avatar name={r} />
                <span className="min-w-0 flex-1"><span className="block text-[15px]">{r}</span><span className="block font-mono text-xs text-faint">{s}</span></span>
                <Badge tone={a === "strong" ? "good" : "warn"}>{a}</Badge>
              </li>
            ))}
          </ul>
        </SampleCard>
      </div>
      <ul className="mt-8 flex flex-wrap gap-x-10 gap-y-2 text-muted">
        {["Facts and inferences labeled separately", "Every score links to its source", "Only pitches services in your playbook"].map((t) => (
          <li key={t} className="flex items-center gap-2"><Icon.check width={16} height={16} className="text-accent" />{t}</li>
        ))}
      </ul>
    </div>
  );
}

function SampleCard({ icon, title, tone = "accent", children }: { icon: ReactNode; title: string; tone?: "accent" | "amber" | "sky"; children: ReactNode }) {
  const tile = { accent: "bg-accent/10 text-accent", amber: "bg-amber-400/10 text-amber-300", sky: "bg-sky-400/10 text-sky-300" }[tone];
  return (
    <Card className="relative p-6">
      <span className="absolute right-5 top-5 rounded-md border border-dashed border-line-2 px-2 py-0.5 text-[11px] tracking-[0.2em] text-faint">SAMPLE</span>
      <div className="flex items-center gap-3 border-b border-line pb-4">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${tile}`}>{icon}</span>
        <span className="text-muted">{title}</span>
      </div>
      {children}
    </Card>
  );
}
