/**
 * Converts TipTap / manuscript HTML fragments into docx Paragraph nodes.
 * Wiki links render as visible label text only (see wiki-link-node.ts — span[data-wiki-link]).
 * Anchor tags with http(s) URLs become ExternalHyperlink; otherwise visible text only.
 */
import {
  AlignmentType,
  ExternalHyperlink,
  HeadingLevel,
  Paragraph,
  TextRun,
  PageBreak,
  UnderlineType,
  type IRunOptions,
  type ParagraphChild,
} from "docx";
import { parse, HTMLElement, TextNode } from "node-html-parser";

const NODE_TEXT = 3;
const NODE_ELEMENT = 1;

type Marks = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
};

export function htmlToDocxParagraphs(html: string | null | undefined): Paragraph[] {
  if (!html?.trim()) {
    return [
      new Paragraph({
        children: [
          new TextRun({
            text: "[No prose in this scene]",
            italics: true,
          }),
        ],
      }),
    ];
  }

  const wrapped = parse(`<div id="bab-export-root">${html}</div>`);
  const root = wrapped.querySelector("#bab-export-root");
  if (!root) return [];

  return walkBlockChildren(root);
}

/** Exported for tests — builds docx body children from a full HTML document fragment. */
export function walkBlockChildren(parent: HTMLElement): Paragraph[] {
  const out: Paragraph[] = [];

  for (const child of parent.childNodes) {
    if (child.nodeType === NODE_TEXT) {
      const t = (child as TextNode).text;
      if (t.trim()) {
        out.push(
          new Paragraph({
            children: inlineToRuns(child as unknown as HTMLElement, {}),
          }),
        );
      }
      continue;
    }

    if (child.nodeType !== NODE_ELEMENT) continue;
    const el = child as HTMLElement;
    const tag = el.tagName?.toLowerCase() ?? "";

    switch (tag) {
      case "p":
        out.push(...blockParagraphFromElement(el));
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        const levelMap: Record<string, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
          h1: HeadingLevel.HEADING_1,
          h2: HeadingLevel.HEADING_2,
          h3: HeadingLevel.HEADING_3,
          h4: HeadingLevel.HEADING_4,
          h5: HeadingLevel.HEADING_5,
          h6: HeadingLevel.HEADING_6,
        };
        const runs = flattenRuns(el);
        out.push(
          new Paragraph({
            heading: levelMap[tag],
            children: runs.length ? runs : [new TextRun({ text: el.textContent ?? "" })],
          }),
        );
        break;
      }
      case "blockquote": {
        const runs = flattenRuns(el);
        out.push(
          new Paragraph({
            indent: { left: 720 },
            children: runs.length
              ? runs
              : [new TextRun({ text: el.textContent ?? "", italics: true })],
          }),
        );
        break;
      }
      case "ul":
        for (const raw of el.childNodes) {
          if (raw.nodeType !== NODE_ELEMENT) continue;
          const li = raw as HTMLElement;
          if (li.tagName?.toLowerCase() !== "li") continue;
          const runs = flattenRuns(li);
          const body =
            runs.length > 0
              ? [new TextRun({ text: "• " }), ...runs]
              : [new TextRun({ text: `• ${li.textContent ?? ""}` })];
          out.push(new Paragraph({ children: body }));
        }
        break;
      case "ol": {
        let n = 1;
        for (const raw of el.childNodes) {
          if (raw.nodeType !== NODE_ELEMENT) continue;
          const li = raw as HTMLElement;
          if (li.tagName?.toLowerCase() !== "li") continue;
          const runs = flattenRuns(li);
          const prefix = `${n}. `;
          n += 1;
          const body =
            runs.length > 0
              ? [new TextRun({ text: prefix }), ...runs]
              : [new TextRun({ text: `${prefix}${li.textContent ?? ""}` })];
          out.push(new Paragraph({ children: body }));
        }
        break;
      }
      case "hr":
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: "* * *" })],
          }),
        );
        break;
      case "br":
        out.push(new Paragraph({ children: [new TextRun({ break: 1 })] }));
        break;
      case "div":
        out.push(...walkBlockChildren(el));
        break;
      default:
        out.push(...blockParagraphFromElement(el));
        break;
    }
  }

  return out.length > 0 ? out : [new Paragraph({ children: [new TextRun("")] })];
}

function blockParagraphFromElement(el: HTMLElement): Paragraph[] {
  const runs = flattenRuns(el);
  if (runs.length === 0 && !(el.textContent ?? "").trim()) return [];
  return [
    new Paragraph({
      children: runs.length ? runs : [new TextRun({ text: el.textContent ?? "" })],
    }),
  ];
}

function flattenRuns(el: HTMLElement): ParagraphChild[] {
  const parts: ParagraphChild[] = [];
  for (const c of el.childNodes) {
    parts.push(...inlineToRuns(c as HTMLElement | TextNode, {}));
  }
  return parts;
}

function inlineToRuns(node: HTMLElement | TextNode, marks: Marks): ParagraphChild[] {
  if (node.nodeType === NODE_TEXT) {
    const text = (node as TextNode).text.replace(/\u00a0/g, " ");
    if (!text) return [];
    return [new TextRun(runOptions(text, marks))];
  }

  if (node.nodeType !== NODE_ELEMENT) return [];

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? "";

  if (tag === "br") {
    return [new TextRun({ break: 1 })];
  }

  if (tag === "strong" || tag === "b") {
    return el.childNodes.flatMap((c) =>
      inlineToRuns(c as HTMLElement | TextNode, { ...marks, bold: true }),
    );
  }

  if (tag === "em" || tag === "i") {
    return el.childNodes.flatMap((c) =>
      inlineToRuns(c as HTMLElement | TextNode, { ...marks, italics: true }),
    );
  }

  if (tag === "u") {
    return el.childNodes.flatMap((c) =>
      inlineToRuns(c as HTMLElement | TextNode, {
        ...marks,
        underline: true,
      }),
    );
  }

  if (tag === "s" || tag === "strike" || tag === "del") {
    return el.childNodes.flatMap((c) =>
      inlineToRuns(c as HTMLElement | TextNode, { ...marks, strike: true }),
    );
  }

  /* WikiLink Mention renders as span[data-wiki-link]; export visible text only. */
  if (tag === "span" && el.getAttribute("data-wiki-link")) {
    const text = el.textContent ?? "";
    return [new TextRun(runOptions(text, marks))];
  }

  if (tag === "a") {
    const href = el.getAttribute("href")?.trim() ?? "";
    const inner = el.childNodes.flatMap((c) =>
      inlineToRuns(c as HTMLElement | TextNode, marks),
    ) as ParagraphChild[];
    const looksExternal = /^https?:\/\//i.test(href);
    if (looksExternal && href) {
      const children =
        inner.length > 0 ? inner : [new TextRun(runOptions(href, marks))];
      return [
        new ExternalHyperlink({
          children,
          link: href,
        }),
      ];
    }
    const label =
      inner.length > 0
        ? inner
        : [new TextRun(runOptions(el.textContent ?? href, marks))];
    return label;
  }

  /* Nested block inside inline context — flatten text */
  return el.childNodes.flatMap((c) =>
    inlineToRuns(c as HTMLElement | TextNode, marks),
  );
}

function runOptions(text: string, marks: Marks): IRunOptions {
  return {
    text,
    bold: marks.bold,
    italics: marks.italics,
    strike: marks.strike,
    underline: marks.underline
      ? { type: UnderlineType.SINGLE }
      : undefined,
  };
}

/** Chapter break between parts of the manuscript (docx section children). */
export function chapterBreakParagraph(): Paragraph {
  return new Paragraph({
    children: [new PageBreak()],
  });
}
