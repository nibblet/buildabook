import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentDoc } from "@/lib/wiki/repo";
import { extractWikiLinks } from "@/lib/wiki/links";
import { getOrCreateProject } from "@/lib/projects";
import { supabaseServer } from "@/lib/supabase/server";
import type { WikiDocType } from "@/lib/supabase/types";

const VALID_TYPES: WikiDocType[] = [
  "character",
  "world",
  "relationship",
  "thread",
  "storyline",
  "index",
];

export default async function WikiDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ docKey: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const { docKey } = await params;
  const { type } = await searchParams;
  const docType = (type as WikiDocType) ?? "character";
  if (!VALID_TYPES.includes(docType)) notFound();

  const doc = await getCurrentDoc(
    project.id,
    docType,
    decodeURIComponent(docKey),
  );
  if (!doc) notFound();

  const supabase = await supabaseServer();
  const { data: all } = await supabase
    .from("wiki_documents")
    .select("id, doc_type, doc_key, title, body_md")
    .eq("project_id", project.id)
    .eq("status", "current");

  const target = (doc.title || "").toLowerCase();
  const backlinks = (all ?? [])
    .filter((d) => d.id !== doc.id)
    .filter((d) => {
      if (!target) return false;
      const links = extractWikiLinks(d.body_md).map((n) => n.toLowerCase());
      return links.includes(target);
    });

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 md:p-8">
      <Link
        href="/wiki"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3 w-3" /> Wiki
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          {doc.title || doc.doc_key}
        </h1>
        <span className="text-xs text-muted-foreground">
          {doc.doc_type} · v{doc.version} · compiled{" "}
          {new Date(doc.compiled_at).toLocaleString()}
        </span>
      </div>
      <pre className="whitespace-pre-wrap rounded-md border bg-card p-4 text-sm leading-relaxed">
        {doc.body_md}
      </pre>

      {backlinks.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">Referenced by</h2>
          <ul className="space-y-1 text-sm">
            {backlinks.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/wiki/${encodeURIComponent(b.doc_key)}?type=${b.doc_type}`}
                  className="underline-offset-4 hover:underline"
                >
                  {b.title || b.doc_key}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {b.doc_type}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
