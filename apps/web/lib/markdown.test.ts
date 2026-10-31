import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parseMarkdown, readingMinutes, renderMarkdown } from "./markdown";

const html = (source: string) => renderToStaticMarkup(renderMarkdown(source) as React.ReactElement);

describe("parseMarkdown", () => {
  it("splits headings, paragraphs, lists and tables", () => {
    const blocks = parseMarkdown(
      ["## Heading", "", "First line", "continues here.", "", "* one", "* two", "", "| A | B |", "|---|---|", "| 1 | 2 |", "", "### Small"].join("\n"),
    );
    expect(blocks).toEqual([
      { type: "heading", level: 2, text: "Heading" },
      { type: "paragraph", text: "First line continues here." },
      { type: "list", items: ["one", "two"] },
      { type: "table", header: ["A", "B"], rows: [["1", "2"]] },
      { type: "heading", level: 3, text: "Small" },
    ]);
  });
});

describe("renderMarkdown", () => {
  it("renders bold, italic and site links", () => {
    const out = html("**Why we love it:** soft *and* airy. [Shop now](/shop)");
    expect(out).toContain('<strong class="font-medium text-ink-950">Why we love it:</strong>');
    expect(out).toContain("<em>and</em>");
    expect(out).toContain('href="/shop"');
  });

  it("never lets the text inject markup or script links", () => {
    const out = html('<script>alert(1)</script> [bad](javascript:alert(1)) [proto](//evil.example)');
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("evil.example");
  });

  it("opens external links in a new tab", () => {
    expect(html("[Read](https://example.com/x)")).toContain('target="_blank" rel="noopener noreferrer"');
  });
});

describe("readingMinutes", () => {
  it("rounds to at least one minute", () => {
    expect(readingMinutes("short")).toBe(1);
    expect(readingMinutes("word ".repeat(1100))).toBe(5);
  });
});
