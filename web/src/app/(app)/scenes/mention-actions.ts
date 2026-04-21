"use server";

import { getOrCreateProject } from "@/lib/projects";
import {
  searchMentionCandidates,
  type MentionCandidate,
} from "@/lib/wiki/mention-search";

export async function mentionSearchAction(
  query: string,
): Promise<MentionCandidate[]> {
  const project = await getOrCreateProject();
  if (!project) return [];
  return searchMentionCandidates(project.id, query, 8);
}
