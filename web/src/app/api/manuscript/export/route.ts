import { getActiveProject } from "@/lib/projects";
import { buildManuscriptDocxBuffer } from "@/lib/export/build-manuscript-docx";
import { chapterHeadingLabel } from "@/lib/manuscript-labels";
import { loadManuscriptExportData } from "@/lib/export/manuscript-payload";
import { slugifyForFilename } from "@/lib/export/filename";

export async function GET(req: Request) {
  const project = await getActiveProject();
  if (!project) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "docx";
  const chapterParam = url.searchParams.get("chapter")?.trim() || null;

  if (format !== "docx") {
    return new Response("Unsupported format", { status: 400 });
  }

  const { chapters } = await loadManuscriptExportData(project.id, chapterParam);

  if (chapterParam && chapters.length === 0) {
    return new Response("Chapter not found", { status: 404 });
  }

  const scopedToSingleChapter = Boolean(chapterParam);
  const buffer = await buildManuscriptDocxBuffer({
    projectTitle: project.title,
    chapters,
    scopedToSingleChapter,
  });

  const base = slugifyForFilename(project.title);
  const filename =
    scopedToSingleChapter && chapters.length === 1
      ? `${base}-${slugifyForFilename(chapterHeadingLabel(chapters[0]!))}.docx`
      : `${base}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
