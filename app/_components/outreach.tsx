"use client";

import { useMemo, useState } from "react";
import type { Channel, TriggerType } from "@/lib/domain/types";
import { fillTemplate, firstName, segmentsToText, type Segment } from "./outreach-fill";
import type { OutreachTemplate } from "./types";
import { Button, Card, CardHead, Icon } from "./ui";

const CHANNEL_LABEL: Record<Channel, string> = { telegram: "Telegram", email: "Email", x: "X DM", linkedin: "LinkedIn" };

/** Outreach draft from the playbook's templates, filled with this project's details. Editable, then copy. */
export function OutreachCard({ templates, project, contactName, trigger, serviceName }: {
  templates: OutreachTemplate[];
  project: string;
  contactName?: string;
  trigger?: TriggerType;
  serviceName: string;
}) {
  const [picked, setPicked] = useState(0);
  const tpl = templates[Math.min(picked, templates.length - 1)];
  const first = firstName(contactName);
  const filled = useMemo(() => (tpl ? {
    subject: tpl.subject ? fillTemplate(tpl.subject, { project, firstName: first, trigger }) : undefined,
    body: fillTemplate(tpl.body.trim(), { project, firstName: first, trigger }),
  } : null), [tpl, project, first, trigger]);

  // edits are kept per template+contact, so switching tabs doesn't lose them
  const key = `${tpl?.id}|${first ?? ""}`;
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!tpl || !filled) {
    return (
      <Card className="p-5" >
        <CardHead icon={<Icon.send />} title="Outreach draft" />
        <p className="mt-4 text-sm text-muted">No outreach template for {serviceName} in your playbook yet.</p>
      </Card>
    );
  }

  const generated = [filled.subject ? `Subject: ${segmentsToText(filled.subject)}\n\n` : "", segmentsToText(filled.body)].join("");
  const text = edits[key] ?? generated;
  const personalised = [...(filled.subject ?? []), ...filled.body].filter((s) => s.kind === "filled").length;
  const todo = edits[key] ? (text.match(/\[[^\]]+\]/g) ?? []).length : [...(filled.subject ?? []), ...filled.body].filter((s) => s.kind === "todo").length;

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <Card className="p-5" >
      <div id="outreach" className="scroll-mt-24" />
      <CardHead icon={<Icon.send />} title="Outreach draft" note={first ? `To ${first}` : undefined} />

      {templates.length > 1 && (
        <div role="tablist" className="mt-4 grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-line bg-bg/60 p-1">
          {templates.map((t, i) => {
            const same = templates.filter((x) => x.channel === t.channel);
            const label = same.length > 1 ? `${CHANNEL_LABEL[t.channel]} ${same.indexOf(t) + 1}` : CHANNEL_LABEL[t.channel];
            return (
              <button key={t.id} role="tab" aria-selected={i === picked} onClick={() => { setPicked(i); setEditing(false); }}
                title={t.subject ? `Subject: ${t.subject}` : t.id}
                className={`rounded-lg px-3 py-1.5 text-sm ${i === picked ? "bg-panel-2 text-ink ring-1 ring-line-2" : "text-muted hover:text-ink"}`}>
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-line bg-bg/60 p-4">
        {editing ? (
          <textarea value={text} onChange={(e) => setEdits({ ...edits, [key]: e.target.value })} rows={12} aria-label="Edit message"
            className="w-full resize-y bg-transparent text-[15px] leading-relaxed text-ink outline-none" />
        ) : edits[key] ? (
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{text}</p>
        ) : (
          <div className="text-[15px] leading-relaxed">
            {filled.subject && <p className="mb-3 text-sm text-muted">Subject: <Segs segs={filled.subject} /></p>}
            <p className="whitespace-pre-wrap"><Segs segs={filled.body} /></p>
          </div>
        )}
        <p className="mt-3 text-xs text-faint">
          {text.length} chars · {personalised} detail{personalised === 1 ? "" : "s"} filled from the analysis
          {todo > 0 && <span className="text-amber-300"> · {todo} to fill in</span>}
          {" "}· template {tpl.id}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button onClick={() => setEditing((v) => !v)}>{editing ? "Done" : "Edit"}</Button>
        <Button onClick={() => { setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== key))); setEditing(false); }} disabled={!edits[key]}>Reset</Button>
        <Button variant="primary" onClick={copy}>{copied ? <><Icon.check width={16} height={16} /> Copied</> : <><Icon.copy width={16} height={16} /> Copy</>}</Button>
      </div>
    </Card>
  );
}

function Segs({ segs }: { segs: Segment[] }) {
  return segs.map((s, i) =>
    s.kind === "plain" ? <span key={i}>{s.text}</span>
      : s.kind === "filled" ? <mark key={i} className="rounded bg-accent/15 px-1 text-accent">{s.text}</mark>
        : <mark key={i} title="Fill this in before sending" className="rounded border border-dashed border-amber-400/50 bg-transparent px-1 text-amber-300">{s.text}</mark>,
  );
}
