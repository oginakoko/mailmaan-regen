import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PendingButton } from "./pending-button";

describe("PendingButton", () => {
  it("renders the idle label with a live region and no spinner", () => {
    const html = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop -- createElement in a .ts test cannot use JSX children
      createElement(PendingButton, { pendingLabel: "Placing order…", children: "Place order" }),
    );
    expect(html).toContain("Place order");
    expect(html).toContain("aria-live");
    expect(html).not.toContain("Placing order");
    expect(html).not.toContain("animate-spin");
  });

  it("merges tone and className and always submits", () => {
    const html = renderToStaticMarkup(
      // eslint-disable-next-line react/no-children-prop -- createElement in a .ts test cannot use JSX children
      createElement(PendingButton, {
        pendingLabel: "Going…",
        children: "Go",
        tone: "green",
        className: "extra-class",
      }),
    );
    expect(html).toContain("extra-class");
    expect(html).toContain('type="submit"');
  });
});
