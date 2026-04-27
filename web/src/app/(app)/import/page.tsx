import { redirect } from "next/navigation";
import { getOrCreateProject } from "@/lib/projects";
import { ImportClient } from "./import-client";

export default async function ImportPage() {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Import
        </p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Import a scene or chapter
        </h1>
        <p className="max-w-prose text-sm text-muted-foreground">
          Paste prose written elsewhere, review the extracted scenes and story
          elements, then append it to your manuscript.
        </p>
      </header>

      <ImportClient />
    </div>
  );
}
