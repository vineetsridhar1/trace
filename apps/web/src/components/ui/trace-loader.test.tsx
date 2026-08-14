import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TraceLoader } from "./trace-loader";

describe("TraceLoader", () => {
  it("uses one animated group for the cursor and trail", () => {
    const markup = renderToStaticMarkup(<TraceLoader showLabel={false} />);

    expect(markup.match(/class="trace-loader-cursor"/g)).toHaveLength(1);
    expect(markup.match(/<circle/g)).toHaveLength(10);
    expect(markup.match(/class="trace-loader-trail-/g)).toHaveLength(2);
    expect(markup).not.toContain("animation-delay");
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
