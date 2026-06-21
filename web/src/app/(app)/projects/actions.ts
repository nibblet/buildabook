"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createProject as createProjectRow,
  setActiveProject,
} from "@/lib/projects";

export async function switchProject(projectId: string) {
  await setActiveProject(projectId);
  revalidatePath("/", "layout");
}

export async function createProject(input: {
  title?: string;
  mode: "blank" | "import";
}) {
  await createProjectRow({
    title: input.title,
    mode: input.mode,
  });
  revalidatePath("/", "layout");

  if (input.mode === "import") {
    redirect("/onboarding");
  }
  redirect("/");
}
