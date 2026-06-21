"use server";

import { revalidatePath } from "next/cache";
import { compileProjectWiki, type CompileReport } from "@/lib/wiki/compile";
import { getActiveProject } from "@/lib/projects";

export async function runCompileProjectWiki(): Promise<CompileReport> {
  const project = await getActiveProject();
  if (!project) throw new Error("No project.");
  const report = await compileProjectWiki(project.id);
  revalidatePath("/wiki");
  return report;
}
