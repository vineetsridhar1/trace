import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TraceLoader } from "./trace-loader";

describe("TraceLoader", () => {
  it("uses two animated cursors traveling in opposite directions", () => {
    const markup = renderToStaticMarkup(<TraceLoader showLabel={false} />);

    expect(markup.match(/<circle class="trace-loader-cursor/g)).toHaveLength(2);
    expect(markup.match(/<circle/g)).toHaveLength(11);
    expect(markup).toContain("animation-direction: reverse");
    expect(markup).not.toContain("trace-loader-trail");
    expect(markup).not.toContain("trace-loader-light");
  });

  it("preserves its accessible label and minimum rendered size", () => {
    const markup = renderToStaticMarkup(
      <TraceLoader label="Preparing workspace" size={8} showLabel={false} color="#abcdef" />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="Preparing workspace"');
    expect(markup).toContain('width="16" height="16"');
    expect(markup).toContain('style="color:#abcdef"');
  });
});
