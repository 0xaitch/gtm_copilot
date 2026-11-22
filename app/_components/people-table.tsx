import type { Contact } from "@/lib/domain/types";
import { Avatar, Badge, Card, CardHead, ExtLink, Icon, xUrl } from "./ui";

const RANK = { strong: 0, medium: 1, weak: 2 } as const;

/** Everyone we tied to the project, strongest evidence first. */
export function PeopleTable({ contacts }: { contacts: Contact[] }) {
  const rows = [...contacts].sort((a, b) => RANK[a.affiliation ?? "weak"] - RANK[b.affiliation ?? "weak"]);
  return (
    <Card className="p-5">
      <CardHead icon={<Icon.users />} title="Team found" tone="sky" note={`${rows.length} people · strongest evidence first`} />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-faint">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Confidence</th>
              <th className="py-2 pl-3 font-medium">Why we think so</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={`${c.name}-${c.handle}-${c.role}`} className="border-b border-line/70 align-top last:border-0">
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={c.name ?? c.handle ?? "?"} />
                    <div className="min-w-0">
                      <p className="font-medium">{c.name ?? c.handle ?? "—"} {c.fromHint && <Badge tone="info">added by you</Badge>}</p>
                      <p className="text-xs text-muted">{c.role}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                  {c.handle ? <ExtLink href={xUrl(c.handle)}>{c.handle}</ExtLink>
                    : c.sourceUrl ? <ExtLink href={c.sourceUrl}>profile</ExtLink> : <span className="text-faint">—</span>}
                  {c.followers != null && <span className="ml-1.5 text-faint">{c.followers.toLocaleString()}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {c.affiliation && <Badge tone={c.affiliation === "strong" ? "good" : c.affiliation === "medium" ? "warn" : "muted"}>{c.affiliation}</Badge>}
                </td>
                <td className="max-w-md py-2.5 pl-3 text-xs text-muted" title={c.bio ? `Bio: ${c.bio}` : undefined}>{c.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
