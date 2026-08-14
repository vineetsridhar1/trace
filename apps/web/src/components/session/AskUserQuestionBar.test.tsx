import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Question } from "@trace/shared";
import { AskUserQuestionBar } from "./AskUserQuestionBar";
import { QuestionCollapsedTray } from "./questions/QuestionCollapsedTray";

function question(id: string): Question {
  return {
    id,
    type: "single-select",
    protocol: "trace",
    header: `Question ${id}`,
    context: `Context for ${id}`,
    question: `Choose an answer for ${id}.`,
    multiSelect: false,
    options: [{ id: "yes", label: "Yes", description: "" }],
  };
}

function render(questions: Question[]): string {
  return renderToStaticMarkup(
    <AskUserQuestionBar
      node={{ id: "question-node", questions }}
      onResponse={() => undefined}
      onDismiss={() => undefined}
    />,
  );
}

function textContent(node: ReactTestInstance | string | number): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map((child) => textContent(child)).join("");
}

function findButton(root: ReactTestInstance, label: string): ReactTestInstance {
  const button = root
    .findAllByType("button")
    .find((candidate) => textContent(candidate).includes(label));
  if (!button) throw new Error(`Could not find button: ${label}`);
  return button;
}

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
class InteractiveElement {
  isContentEditable = false;
  closest() {
    return this;
  }
}

beforeAll(() => {
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("HTMLElement", InteractiveElement);
});

afterAll(() => {
  delete actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllGlobals();
});

describe("AskUserQuestionBar", () => {
  it("renders one question inside the composer tray", () => {
    const markup = render([question("one")]);

    expect(markup).toContain("Answer before I continue");
    expect(markup).not.toContain("Question 1 of 1");
    expect(markup).not.toContain("trace:request-input");
    expect(markup).not.toContain("single-select");
    expect(markup).toContain('aria-label="Exit to chat"');
    expect(markup).not.toContain('role="dialog"');
    expect(markup).not.toContain("fixed inset-0");
    expect(markup.indexOf("number keys pick")).toBeLessThan(markup.indexOf("You decide"));
    expect(markup.indexOf("You decide")).toBeLessThan(markup.indexOf(">Back<"));
    expect(markup.indexOf(">Back<")).toBeLessThan(markup.indexOf(">Next<"));
    expect(markup).toContain('aria-label="Go to previous question" disabled=""');
  });

  it("starts a multi-question set as a progressive stack", () => {
    const markup = render([question("one"), question("two")]);

    expect(markup).toContain("Answer before I continue");
    expect(markup).toContain("question 1 of 2");
    expect(markup).toContain("Context for one");
    expect(markup).toContain(">Next<");
    expect(markup).not.toContain("Answer &amp; show question 2");
    expect(markup).not.toContain("sm:grid-cols-[212px_1fr]");
  });

  it("collapses to a waiting tray", () => {
    const markup = renderToStaticMarkup(
      <AskUserQuestionBar
        node={{ id: "question-node", questions: [question("one")] }}
        collapsed
        onResponse={() => undefined}
        onDismiss={() => undefined}
        onResume={() => undefined}
      />,
    );

    expect(markup).toContain("1 question waiting");
    expect(markup).toContain("tray collapsed");
    expect(markup).toContain("Resume");
    expect(markup).not.toContain("You decide");
  });

  it("preserves an answer while dismissing and resuming a question", async () => {
    const onDismiss = vi.fn();
    const onResume = vi.fn();
    const node = { id: "question-node", questions: [question("one")] };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={node}
          onResponse={() => undefined}
          onDismiss={onDismiss}
          onResume={onResume}
        />,
      );
    });
    await act(async () => findButton(renderer.root, "Yes").props.onClick());
    await act(async () =>
      renderer.root.findByProps({ "aria-label": "Exit to chat" }).props.onClick(),
    );
    expect(onDismiss).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.update(
        <AskUserQuestionBar
          node={node}
          collapsed
          onResponse={() => undefined}
          onDismiss={onDismiss}
          onResume={onResume}
        />,
      );
    });
    await act(async () => findButton(renderer.root, "Resume").props.onClick());
    expect(onResume).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.update(
        <AskUserQuestionBar
          node={node}
          onResponse={() => undefined}
          onDismiss={onDismiss}
          onResume={onResume}
        />,
      );
    });
    expect(findButton(renderer.root, "Next").props.disabled).toBe(false);
    await act(async () => renderer.unmount());
  });

  it("labels a fully answered collapsed review without a zero count", () => {
    const markup = renderToStaticMarkup(
      <QuestionCollapsedTray
        questions={[question("one")]}
        answeredCount={1}
        nextQuestion="Review your answer"
        onResume={() => undefined}
      />,
    );

    expect(markup).toContain("Answers ready to send");
    expect(markup).not.toContain("0 questions waiting");
  });

  it("prevents duplicate response submissions", async () => {
    let finishResponse: (() => void) | undefined;
    const onResponse = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishResponse = resolve;
        }),
    );
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-one", questions: [question("one")] }}
          onResponse={onResponse}
          onDismiss={() => undefined}
        />,
      );
    });
    await act(async () => findButton(renderer.root, "Yes").props.onClick());
    await act(async () => findButton(renderer.root, "Next").props.onClick());

    await act(async () => {
      const send = findButton(renderer.root, "Send 1 answer");
      void send.props.onClick();
      void send.props.onClick();
    });
    expect(onResponse).toHaveBeenCalledTimes(1);

    await act(async () => finishResponse?.());
    await act(async () => renderer.unmount());
  });

  it("does not run global Enter shortcuts from an interactive control", async () => {
    const addEventListener = vi.mocked(window.addEventListener);
    addEventListener.mockClear();
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-keyboard", questions: [question("one")] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await act(async () => findButton(renderer.root, "Yes").props.onClick());
    const keydownCalls = addEventListener.mock.calls.filter(
      ([eventName]) => eventName === "keydown",
    );
    const keydown = keydownCalls[keydownCalls.length - 1]?.[1] as
      | ((event: KeyboardEvent) => void)
      | undefined;
    expect(keydown).toBeDefined();

    await act(async () =>
      keydown?.({
        key: "Enter",
        target: new InteractiveElement(),
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent),
    );
    expect(findButton(renderer.root, "Next")).toBeDefined();
    expect(renderer.root.findAllByProps({ children: "Send 1 answer" })).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it("resets answers when React mounts a new request key", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          key="request-one"
          node={{ id: "request-one", questions: [question("one"), question("two")] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await act(async () => findButton(renderer.root, "Yes").props.onClick());
    await act(async () => findButton(renderer.root, "Next").props.onClick());
    expect(JSON.stringify(renderer.toJSON())).toContain("Choose an answer for two.");

    await act(async () => {
      renderer.update(
        <AskUserQuestionBar
          key="request-two"
          node={{ id: "request-two", questions: [question("new")] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    expect(findButton(renderer.root, "Next").props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("Choose an answer for new.");
    await act(async () => renderer.unmount());
  });

  it("requires text when something else is selected", async () => {
    const otherQuestion: Question = {
      ...question("other"),
      type: "select-with-other",
      options: [],
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-other", questions: [otherQuestion] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    await act(async () => findButton(renderer.root, "Something else").props.onClick());
    expect(findButton(renderer.root, "Next").props.disabled).toBe(true);
    const textarea = renderer.root.findByType("textarea");
    await act(async () => textarea.props.onChange({ target: { value: "Use a kiosk" } }));
    expect(findButton(renderer.root, "Something else").props["aria-pressed"]).toBe(true);
    expect(findButton(renderer.root, "Next").props.disabled).toBe(false);
    await act(async () => renderer.unmount());
  });

  it("accepts and serializes a custom answer for a choice question", async () => {
    const onResponse = vi.fn(() => Promise.resolve());
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-custom-answer", questions: [question("custom")] }}
          onResponse={onResponse}
          onDismiss={() => undefined}
        />,
      );
    });

    const customAnswer = renderer.root.findByType("textarea");
    expect(customAnswer.props.placeholder).toBe("Write your own answer…");
    expect(customAnswer.props.className).toContain("border-border");
    expect(customAnswer.props.className).toContain("min-h-10");
    expect(customAnswer.props.className).toContain("leading-5");
    expect(customAnswer.props.className).toContain("[field-sizing:content]");
    expect(customAnswer.props.className).not.toContain("text-center");
    expect(customAnswer.props.className).not.toContain("ring-2");
    await act(async () => findButton(renderer.root, "Yes").props.onClick());
    const textarea = renderer.root.findByType("textarea");
    await act(async () => textarea.props.onChange({ target: { value: "Use a tablet kiosk" } }));
    expect(findButton(renderer.root, "Yes").props["aria-pressed"]).toBe(false);
    await act(async () => findButton(renderer.root, "Next").props.onClick());
    await act(async () => findButton(renderer.root, "Send 1 answer").props.onClick());

    expect(onResponse).toHaveBeenCalledWith(
      expect.stringContaining("<text>Use a tablet kiosk</text>"),
      [],
    );
    expect(onResponse).toHaveBeenCalledWith(
      expect.not.stringContaining("<selected>yes</selected>"),
      [],
    );
    await act(async () => renderer.unmount());
  });

  it("allows a custom answer without selecting an option", async () => {
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-custom-only", questions: [question("custom-only")] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    const textarea = renderer.root.findByType("textarea");
    await act(async () => textarea.props.onChange({ target: { value: "A custom direction" } }));
    expect(findButton(renderer.root, "Next").props.disabled).toBe(false);
    await act(async () => renderer.unmount());
  });

  it("continues text questions with Enter and preserves Shift+Enter for a new line", async () => {
    const textQuestion: Question = {
      ...question("text"),
      type: "text",
      options: [],
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-text", questions: [textQuestion] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    const textarea = renderer.root.findByType("textarea");
    await act(async () => textarea.props.onChange({ target: { value: "A concise answer" } }));

    const enter = {
      key: "Enter",
      shiftKey: false,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn(),
    };
    await act(async () => textarea.props.onKeyDown(enter));
    expect(enter.preventDefault).toHaveBeenCalledOnce();
    expect(findButton(renderer.root, "Send 1 answer")).toBeDefined();

    await act(async () => renderer.unmount());
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-text-shift", questions: [textQuestion] }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    const shiftedTextarea = renderer.root.findByType("textarea");
    const shiftEnter = {
      key: "Enter",
      shiftKey: true,
      nativeEvent: { isComposing: false },
      preventDefault: vi.fn(),
    };
    await act(async () => shiftedTextarea.props.onKeyDown(shiftEnter));
    expect(shiftEnter.preventDefault).not.toHaveBeenCalled();
    expect(findButton(renderer.root, "Next")).toBeDefined();
    await act(async () => renderer.unmount());
  });

  it("keeps reference files owned by the question where they were attached", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reference");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const referenceQuestion = (id: string): Question => ({
      ...question(id),
      type: "reference",
      options: [],
      accept: "application/pdf",
    });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{
            id: "request-references",
            questions: [referenceQuestion("first"), referenceQuestion("second")],
          }}
          onResponse={() => undefined}
          onDismiss={() => undefined}
        />,
      );
    });
    const file = new File(["brief"], "brand.pdf", { type: "application/pdf" });
    const fileInput = renderer.root.find(
      (candidate) => candidate.type === "input" && candidate.props.type === "file",
    );
    await act(async () => fileInput.props.onChange({ target: { files: [file], value: "" } }));
    expect(findButton(renderer.root, "Next").props.disabled).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).toContain("brand.pdf");

    await act(async () => findButton(renderer.root, "Next").props.onClick());
    expect(findButton(renderer.root, "Next").props.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("brand.pdf");

    await act(async () => renderer.unmount());
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:reference");
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });

  it("serializes and submits reference filenames with their attachments", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:submission");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const onResponse = vi.fn(() => Promise.resolve());
    const referenceQuestion: Question = {
      ...question("reference"),
      type: "reference",
      options: [],
      accept: "application/pdf",
    };
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <AskUserQuestionBar
          node={{ id: "request-reference", questions: [referenceQuestion] }}
          onResponse={onResponse}
          onDismiss={() => undefined}
        />,
      );
    });
    const file = new File(["brief"], "brief.pdf", { type: "application/pdf" });
    const fileInput = renderer.root.find(
      (candidate) => candidate.type === "input" && candidate.props.type === "file",
    );
    await act(async () => fileInput.props.onChange({ target: { files: [file], value: "" } }));
    await act(async () => findButton(renderer.root, "Next").props.onClick());
    await act(async () => findButton(renderer.root, "Send 1 answer").props.onClick());

    expect(onResponse).toHaveBeenCalledWith(
      expect.stringContaining("<text>brief.pdf</text>"),
      expect.arrayContaining([expect.objectContaining({ file })]),
    );
    await act(async () => renderer.unmount());
    vi.restoreAllMocks();
  });
});
