import { createElement, Fragment, type ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for journal stories and the About page: headings, paragraphs,
 * bullet lists, tables, pull quotes, **bold**, *italic* and [links](/shop).
 *
 * Builds React elements rather than an HTML string, so nothing in the text can inject markup — the
 * stories live in the database, and this keeps that a content concern, not a security one. Links
 * are limited to this site's own paths and https URLs.
 */

export type Block =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "rule" };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      flush();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      // A single # is the page title, which the page itself renders — inside a story it's a section heading.
      blocks.push({ type: "heading", level: heading[1].length === 3 ? 3 : 2, text: heading[2] });
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flush();
      blocks.push({ type: "rule" });
      continue;
    }

    if (/^[*-]\s+/.test(line)) {
      flush();
      const items: string[] = [];
      while (i < lines.length && /^[*-]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[*-]\s+/, ""));
        i++;
      }
      i--;
      blocks.push({ type: "list", items });
      continue;
    }

    if (line.startsWith(">")) {
      flush();
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      i--;
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (line.startsWith("|") && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      flush();
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i++;
      }
      i--;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    paragraph.push(line);
  }
  flush();
  return blocks;
}

function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https:\/\//i.test(href) ? href : null;
}

/** **bold**, *italic* and [text](href) inside a line of text. */
export function renderInline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${n++}`;
    if (match[1] !== undefined) out.push(createElement("strong", { key, className: "font-medium text-ink-950" }, ...renderInline(match[1], key)));
    else if (match[2] !== undefined) out.push(createElement("em", { key }, ...renderInline(match[2], key)));
    else {
      const href = safeHref(match[4]);
      const external = href?.startsWith("https://");
      out.push(
        href
          ? createElement(
              "a",
              { key, href, className: "underline underline-offset-4 decoration-accent hover:text-ink-950", ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) },
              ...renderInline(match[3], key),
            )
          : match[3],
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(source: string): ReactNode {
  const children = parseMarkdown(source).map((block, index) => {
    const key = `b${index}`;
    switch (block.type) {
      case "heading":
        return block.level === 2
          ? createElement("h2", { key, className: "font-serif text-3xl text-ink-950 mt-14 mb-5 leading-snug" }, ...renderInline(block.text, key))
          : createElement("h3", { key, className: "font-serif text-xl text-ink-950 mt-10 mb-3" }, ...renderInline(block.text, key));
      case "paragraph":
        return createElement("p", { key, className: "mb-5" }, ...renderInline(block.text, key));
      case "list":
        return createElement(
          "ul",
          { key, className: "mb-6 space-y-2 pl-5 list-disc marker:text-accent" },
          ...block.items.map((item, j) => createElement("li", { key: `${key}-${j}` }, ...renderInline(item, `${key}-${j}`))),
        );
      case "quote":
        return createElement(
          "blockquote",
          { key, className: "my-10 border-l-2 border-accent pl-6 font-serif text-2xl italic text-ink-900 leading-snug" },
          ...renderInline(block.text, key),
        );
      case "rule":
        return createElement("hr", { key, className: "my-12 border-stone-200" });
      case "table":
        return createElement(
          "div",
          { key, className: "my-8 overflow-x-auto" },
          createElement(
            "table",
            { className: "w-full text-sm border-collapse" },
            createElement(
              "thead",
              null,
              createElement(
                "tr",
                { className: "border-b border-ink-950 text-left" },
                ...block.header.map((h, j) => createElement("th", { key: j, className: "py-2 pr-4 font-medium text-ink-950" }, ...renderInline(h, `${key}-h${j}`))),
              ),
            ),
            createElement(
              "tbody",
              null,
              ...block.rows.map((row, r) =>
                createElement(
                  "tr",
                  { key: r, className: "border-b border-stone-200 align-top" },
                  ...row.map((cell, j) => createElement("td", { key: j, className: "py-2 pr-4" }, ...renderInline(cell, `${key}-${r}-${j}`))),
                ),
              ),
            ),
          ),
        );
    }
  });
  return createElement(Fragment, null, ...children);
}

/** Plain-text word count, for "6 min read". */
export function readingMinutes(source: string): number {
  const words = source.replace(/[#*|>[\]()_-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
