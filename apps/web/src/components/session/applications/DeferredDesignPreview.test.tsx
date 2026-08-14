import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DeferredDesignPreview } from "./DeferredDesignPreview";

describe("DeferredDesignPreview", () => {
  it("does not create an iframe before a card is activated", () => {
    const markup = renderToStaticMarkup(
      <DeferredDesignPreview url="/design-previews/groups/group-1" title="Design preview" />,
    );

    expect(markup).not.toContain("<iframe");
    expect(markup).toContain("svg");
  });
});
