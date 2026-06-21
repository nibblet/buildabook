"use server";

import { getActiveProject } from "@/lib/projects";
import {
  searchMentionCandidates,
  type MentionCandidate,
} from "@/lib/wiki/mention-search";

export async function mentionSearchAction(
  query: string,
): Promise<MentionCandidate[]> {
  const project = await getActiveProject();
  if (!project) return [];
  return searchMentionCandidates(project.id, query, 8);
}
