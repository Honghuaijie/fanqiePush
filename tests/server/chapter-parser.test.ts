import { describe, expect, it } from "vitest";
import { parseChapterFileName, parseMarkdownBody } from "../../src/server/chapter-parser";

describe("chapter parser", () => {
  it("parses supported chapter file names", () => {
    expect(parseChapterFileName("第001章 开局.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 开局"
    });
  });

  it("rejects unsupported file names", () => {
    expect(parseChapterFileName("001.md")).toBeNull();
    expect(parseChapterFileName("第1章 开局.txt")).toBeNull();
  });

  it("removes the first markdown heading from body content", () => {
    const markdown = "# 第001章 开局\n\n这是第一章正文。\n\n第二段。";
    expect(parseMarkdownBody(markdown)).toEqual({
      body: "这是第一章正文。\n\n第二段。",
      characterCount: 12
    });
  });
});
