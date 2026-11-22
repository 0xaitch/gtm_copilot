import type { Contact } from "@/lib/domain/types";
import { Badge, Card, ExtLink, xUrl } from "./ui";

const RANK = { strong: 0, medium: 1, weak: 2 } as const;

/** Everyone we tied to the project, strongest evidence first. */
export function PeopleTable({ contacts }: { contacts: Contact[] }) {
  const rows = [...contacts].sort((a, b) => RANK[a.affiliation ?? "weak"] - RANK[b.affiliation ?? "weak"]);
  return (
    <Card className="overflow-hidden">
      <h3 className="border-b border-zinc-200 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
        Team found · {rows.length}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="px-4 py-1.5 font-medium">Name</th>
              <th className="px-2 py-1.5 font-medium">Role</th>
              <th className="px-2 py-1.5 font-medium">Link</th>
              <th className="px-2 py-1.5 font-medium">Confidence</th>
              <th className="px-4 py-1.5 font-medium">Why we think so</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={`${c.name}-${c.handle}-${c.role}`} className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-800/60">
                <td className="whitespace-nowrap px-4 py-1.5 font-medium">
                  {c.name ?? c.handle ?? "—"}
                  {c.fromHint && <> <Badge tone="info">added by you</Badge></>}
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">{c.role}</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  {c.handle ? <ExtLink href={xUrl(c.handle)}>{c.handle}</ExtLink>
                    : c.sourceUrl ? <ExtLink href={c.sourceUrl}>profile</ExtLink> : <span className="text-zinc-400">—</span>}
                  {c.followers != null && <span className="ml-1 text-xs tabular-nums text-zinc-500">{c.followers.toLocaleString()}</span>}
                </td>
                <td className="px-2 py-1.5">
                  {c.affiliation && <Badge tone={c.affiliation === "strong" ? "good" : c.affiliation === "medium" ? "warn" : "muted"}>{c.affiliation}</Badge>}
                </td>
                <td className="max-w-md px-4 py-1.5 text-xs text-zinc-500" title={c.bio ? `Bio: ${c.bio}` : undefined}>{c.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
