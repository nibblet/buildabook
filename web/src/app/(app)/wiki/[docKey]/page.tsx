import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentDoc } from "@/lib/wiki/repo";
import { getOrCreateProject } from "@/lib/projects";
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

  const doc = await getCurrentDoc(project.id, docType, decodeURIComponent(docKey));
  if (!doc) notFound();

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
    </div>
  );
}
