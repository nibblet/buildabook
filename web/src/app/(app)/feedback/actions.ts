"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getOrCreateProject } from "@/lib/projects";

export type FeedbackActionState = { ok?: boolean; error?: string };

export async function submitFeedback(
  _prev: FeedbackActionState,
  formData: FormData,
): Promise<FeedbackActionState> {
  const raw = String(formData.get("body") ?? "").trim();
  if (!raw) {
    return { error: "Write something first." };
  }
  if (raw.length > 12_000) {
    return { error: "That’s too long — try shortening to 12,000 characters." };
  }

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You’re not signed in." };
  }

  let projectId: string | null = null;
  try {
    const project = await getOrCreateProject();
    projectId = project?.id ?? null;
  } catch {
    /* feedback still valuable without project row */
  }

  const pageContext = String(formData.get("page_context") ?? "").slice(0, 240);

  const { error } = await supabase.from("app_feedback").insert({
    user_id: user.id,
    project_id: projectId,
    author_email: user.email ?? null,
    body: raw,
    page_context: pageContext || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/feedback");
  revalidatePath("/admin");
  return { ok: true };
}
