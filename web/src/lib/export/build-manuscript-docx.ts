import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import type { ManuscriptExportChapter } from "@/lib/export/manuscript-payload";
import {
  chapterBreakParagraph,
  htmlToDocxParagraphs,
} from "@/lib/export/html-to-docx-paragraphs";
import {
  chapterHeadingLabel,
  sceneHeadingLabel,
} from "@/lib/manuscript-labels";

export async function buildManuscriptDocxBuffer(options: {
  projectTitle: string;
  chapters: ManuscriptExportChapter[];
  scopedToSingleChapter: boolean;
}): Promise<Buffer> {
  const { projectTitle, chapters, scopedToSingleChapter } = options;

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: projectTitle })],
    }),
  );

  if (scopedToSingleChapter && chapters.length === 1) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: chapterHeadingLabel(chapters[0]!),
            italics: true,
          }),
        ],
      }),
    );
  }

  if (chapters.length === 0) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "No chapters to export.",
            italics: true,
          }),
        ],
      }),
    );
  }

  for (let ci = 0; ci < chapters.length; ci++) {
    const ch = chapters[ci]!;
    if (ci > 0) {
      children.push(chapterBreakParagraph());
    }

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: chapterHeadingLabel(ch) })],
      }),
    );

    if (ch.scenes.length === 0) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "No scenes in this chapter.",
              italics: true,
            }),
          ],
        }),
      );
      continue;
    }

    ch.scenes.forEach((scene, sceneIdx) => {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: sceneHeadingLabel(scene, sceneIdx),
            }),
          ],
        }),
      );
      children.push(...htmlToDocxParagraphs(scene.content));
    });
  }

  const doc = new Document({
    title: projectTitle,
    sections: [
      {
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
