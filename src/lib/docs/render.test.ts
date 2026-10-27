import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./render";

function render(source: string): string {
  return renderToStaticMarkup(createElement(Markdown, { source }));
}

describe("Markdown lists", () => {
  it("groups consecutive ordered items with wrapped lines into one list", () => {
    const html = render(
      [
        "1. **First** — wrapped onto",
        "   the next line.",
        "2. Second with `code spanning",
        "   the wrap` intact.",
      ].join("\n"),
    );
    expect(html.match(/<ol/g)?.length).toBe(1);
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain("First</strong> — wrapped onto the next line.");
    expect(html).toContain("<code");
    expect(html).toContain(">code spanning the wrap</code> intact.");
    expect(html).not.toContain("`");
  });

  it("keeps unordered lists grouped and stops at a new block", () => {
    const html = render(["- one", "- two", "", "A paragraph."].join("\n"));
    expect(html.match(/<ul/g)?.length).toBe(1);
    expect(html.match(/<li/g)?.length).toBe(2);
    expect(html).toContain("A paragraph.");
  });
});
