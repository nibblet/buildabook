import { redirect } from "next/navigation";
import { getOrCreateProject, isOnboarded } from "@/lib/projects";
import { loadSpine } from "@/lib/spine";
import { getManuscriptChapters } from "@/lib/manuscript";
import {
  ManuscriptReaderClient,
  type ManuscriptChapterPayload,
} from "./manuscript-reader-client";

export default async function ManuscriptPage({
  searchParams,
}: {
  searchParams: Promise<{ chapter?: string }>;
}) {
  const project = await getOrCreateProject();
  if (!project) redirect("/login");

  const onboarded = await isOnboarded(project.id);
  if (!onboarded) redirect("/onboarding");

  const { chapter: chapterParam } = await searchParams;
  const chapterFilter =
    typeof chapterParam === "string" && chapterParam.trim()
      ? chapterParam.trim()
      : null;

  const spine = await loadSpine(project.id);
  const manuscriptChapters = getManuscriptChapters(spine, chapterFilter);

  if (chapterFilter && manuscriptChapters.length === 0) {
    redirect("/manuscript");
  }

  const payload: ManuscriptChapterPayload[] = manuscriptChapters.map((c) => ({
    chapter: {
      id: c.id,
      title: c.title,
      order_index: c.order_index,
    },
    scenes: c.scenes.map((s) => ({
      id: s.id,
      title: s.title,
      content: s.content,
      wordcount: s.wordcount,
      order_index: s.order_index,
    })),
  }));

  const totalWords = manuscriptChapters.reduce(
    (sum, ch) =>
      sum + ch.scenes.reduce((s, sc) => s + (sc.wordcount ?? 0), 0),
    0,
  );

  return (
    <ManuscriptReaderClient
      chapters={payload}
      totalWords={totalWords}
      singleChapterMode={Boolean(chapterFilter)}
    />
  );
}
