import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { AssistantText } from "./AssistantText";
import { renderMermaid } from "../../ui/mermaidRenderer";

vi.mock("../../ui/mermaidRenderer", () => ({ renderMermaid: vi.fn() }));

let view: ReactTestRenderer | undefined;

afterEach(() => {
  act(() => view?.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("renders Mermaid fences inline within assistant conversation messages", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.mocked(renderMermaid).mockResolvedValue("data:image/svg+xml,diagram");
  await act(async () => {
    view = create(
      <AssistantText
        eventId="assistant-event"
        text={
          "Here is the flow:\n\n```mermaid\ngraph TD\n  A-->B\n```\n\nContinue here.\n\n```js\nconst value = 1;\n```"
        }
      />,
    );
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });

  expect(view!.root.findByType("img").props.src).toBe("data:image/svg+xml,diagram");
  expect(view!.root.findAllByType("p").map((node) => node.children.join(""))).toEqual([
    "Here is the flow:",
    "Continue here.",
  ]);
  expect(view!.root.findByProps({ className: "language-js" }).children).toEqual([
    "const value = 1;\n",
  ]);
  expect(renderMermaid).toHaveBeenCalledWith("graph TD\n  A-->B\n", expect.any(String));
});
