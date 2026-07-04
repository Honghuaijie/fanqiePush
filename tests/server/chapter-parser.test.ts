import { describe, expect, it } from "vitest";
import { parseChapterFileName, parseMarkdownBody } from "../../src/server/chapter-parser";

describe("chapter parser", () => {
  it("parses supported chapter file names", () => {
    expect(parseChapterFileName("第001章 开局.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 开局"
    });

    expect(parseChapterFileName("第1章 夜雨.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "1",
      title: "第1章 夜雨"
    });

    expect(parseChapterFileName("001-风起.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 风起"
    });

    expect(parseChapterFileName("001_入城.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 入城"
    });

    expect(parseChapterFileName("001. 一掌镇宗师.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 一掌镇宗师"
    });

    expect(parseChapterFileName("001 热搜里的尸骨拳.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章 热搜里的尸骨拳"
    });

    expect(parseChapterFileName("001.md")).toEqual({
      chapterNumber: 1,
      displayNumber: "001",
      title: "第001章"
    });
  });

  it("uses fallback numbering when a file name has no chapter number", () => {
    expect(parseChapterFileName("开局.md", 3)).toEqual({
      chapterNumber: 3,
      displayNumber: "003",
      title: "第003章 开局",
      autoNumbered: true
    });
  });

  it("rejects unsupported file names without fallback numbering", () => {
    expect(parseChapterFileName("开局.md")).toBeNull();
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
