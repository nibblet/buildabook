import { describe, it, expect } from "vitest";
import { Document, Packer } from "docx";
import { htmlToDocxParagraphs } from "./html-to-docx-paragraphs";

async function packParagraphs(html: string) {
  const paras = htmlToDocxParagraphs(html);
  const doc = new Document({
    sections: [{ children: paras }],
  });
  return Packer.toBuffer(doc);
}

describe("htmlToDocxParagraphs", () => {
  it("uses placeholder when html is empty", () => {
    const paras = htmlToDocxParagraphs("");
    expect(paras.length).toBe(1);
  });

  it("packs plain paragraph without throwing", async () => {
    const buf = await packParagraphs("<p>Hello world.</p>");
    expect(buf.byteLength).toBeGreaterThan(2000);
  });

  it("packs bold and italic markup", async () => {
    const buf = await packParagraphs(
      "<p><strong>Bold</strong> and <em>italic</em>.</p>",
    );
    expect(buf.byteLength).toBeGreaterThan(2000);
  });

  it("packs nested emphasis", async () => {
    const buf = await packParagraphs(
      "<p><strong>bold <em>italic inside</em></strong></p>",
    );
    expect(buf.byteLength).toBeGreaterThan(2000);
  });

  it("exports wiki span as visible text only", async () => {
    const buf = await packParagraphs(
      '<p><span data-wiki-link="1" data-target-type="character" data-target-key="ada">Ada</span></p>',
    );
    expect(buf.byteLength).toBeGreaterThan(2000);
  });
});
