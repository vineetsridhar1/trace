import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CondensedSessionMessages } from "./CondensedSessionMessages";

describe("CondensedSessionMessages", () => {
  it("renders a structured question response as a friendly answer", () => {
    const markup = renderToStaticMarkup(
      <CondensedSessionMessages
        summary={{
          userText:
            '<trace:input-response id="workflow"><selected>today-upcoming</selected></trace:input-response>',
          assistantText: null,
          actionCount: 0,
        }}
        active={false}
        bottomPadding={0}
      />,
    );

    expect(markup).toContain("My answer");
    expect(markup).toContain("Workflow:");
    expect(markup).toContain("Today upcoming");
    expect(markup).not.toContain("trace:input-response");
  });
});
