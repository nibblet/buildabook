import Link from "next/link";
import { redirect } from "next/navigation";
import { listCurrentDocs } from "@/lib/wiki/repo";
import { getOrCreateProject } from "@/lib/projects";
import type { WikiDocument } from "@/lib/supabase/types";
import { CompileButton } from "./compile-button";

export const dynamic = "force-dynamic";

export default async function WikiPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const docs = await listCurrentDocs(project.id);
  const byType = new Map<string, WikiDocument[]>();
  for (const d of docs) {
    const arr = byType.get(d.doc_type) ?? [];
    arr.push(d);
    byType.set(d.doc_type, arr);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Compiled wiki
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">
            Wiki
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Derived markdown summaries of every character, world element,
            relationship and storyline index. Regenerated whenever you compile.
          </p>
        </div>
        <CompileButton />
      </header>

      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No compiled docs yet. Run a compile.
        </p>
      ) : (
        <div className="space-y-6">
          {[...byType.entries()].map(([type, list]) => (
            <section key={type}>
              <h2 className="mb-2 text-sm font-semibold capitalize">{type}</h2>
              <ul className="space-y-1 text-sm">
                {list.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/wiki/${encodeURIComponent(d.doc_key)}?type=${d.doc_type}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {d.title || d.doc_key}
                    </Link>
                    <span className="ml-2 text-xs text-muted-foreground">
                      v{d.version}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
