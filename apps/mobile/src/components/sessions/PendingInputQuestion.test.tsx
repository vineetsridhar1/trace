import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Question } from "@trace/shared";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

interface FooterProps {
  label: string;
  disabled: boolean;
  onPrimary: () => void;
}

interface DecideProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

let footerProps: FooterProps | null = null;
let decideProps: DecideProps | null = null;
const closeMock = vi.fn();
const submitMock = vi.fn();

vi.mock("react-native", () => ({
  Keyboard: {
    addListener: () => ({ remove: vi.fn() }),
  },
  Platform: { OS: "ios" },
  ScrollView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("ScrollView", null, children),
  StyleSheet: { absoluteFillObject: {}, create: <T,>(styles: T) => styles },
  View: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("View", props, children),
}));

vi.mock("react-native-keyboard-controller", () => ({
  KeyboardStickyView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("KeyboardStickyView", null, children),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("@trace/client-core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@trace/client-core")>();
  return {
    ...original,
    useAuthStore: (selector: (state: { activeOrgId: string }) => unknown) =>
      selector({ activeOrgId: "org-1" }),
  };
});

vi.mock("@/components/design-system", () => ({
  Text: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("Text", props, children),
}));

vi.mock("@/lib/haptics", () => ({
  haptic: { error: vi.fn(), light: vi.fn(), selection: vi.fn() },
}));

vi.mock("@/lib/question-response-submit", () => ({
  submitQuestionResponse: (...args: unknown[]) => submitMock(...args),
}));

vi.mock("@/lib/requestError", () => ({
  userFacingError: (_error: unknown, fallback: string) => fallback,
}));

vi.mock("./question-flow/QuestionFlowControl", () => ({
  QuestionFlowControl: () => React.createElement("QuestionFlowControl"),
}));

vi.mock("./question-flow/QuestionFlowFooter", () => ({
  QuestionFlowFooter: (props: FooterProps) => {
    footerProps = props;
    return React.createElement("QuestionFlowFooter", props);
  },
}));

vi.mock("./question-flow/QuestionFlowHeader", () => ({
  QuestionFlowHeader: () => React.createElement("QuestionFlowHeader"),
}));

vi.mock("./question-flow/QuestionFlowOption", () => ({
  QuestionFlowOption: (props: DecideProps) => {
    decideProps = props;
    return React.createElement("QuestionFlowOption", props);
  },
}));

vi.mock("./question-flow/QuestionFlowReview", () => ({
  QuestionFlowReview: () => React.createElement("QuestionFlowReview"),
}));

import { PendingInputQuestion } from "./PendingInputQuestion";

const question: Question = {
  id: "direction",
  protocol: "trace",
  type: "single-select",
  header: "Direction",
  question: "Which direction should I take?",
  options: [{ id: "ship", label: "Ship", description: "" }],
  multiSelect: false,
};

describe("PendingInputQuestion", () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    footerProps = null;
    decideProps = null;
    closeMock.mockReset();
    submitMock.mockReset().mockResolvedValue([]);
  });

  it("selects You decide and waits for the normal review and send actions", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PendingInputQuestion
          sessionId="session-1"
          questions={[question]}
          hasActivePlan={false}
          onClose={closeMock}
        />,
      );
    });

    expect(footerProps?.disabled).toBe(true);
    await act(async () => decideProps?.onPress());
    expect(decideProps?.selected).toBe(true);
    expect(footerProps?.disabled).toBe(false);
    expect(closeMock).not.toHaveBeenCalled();

    await act(async () => footerProps?.onPrimary());
    expect(footerProps?.label).toBe("Send 1 answer");
    expect(submitMock).not.toHaveBeenCalled();

    await act(async () => footerProps?.onPrimary());
    expect(submitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        text: expect.stringContaining("you-decide"),
      }),
    );
    expect(closeMock).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });

  it("keeps the review open and offers retry when sending fails", async () => {
    submitMock.mockRejectedValueOnce(new Error("offline"));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <PendingInputQuestion
          sessionId="session-1"
          questions={[question]}
          hasActivePlan={false}
          onClose={closeMock}
        />,
      );
    });

    await act(async () => decideProps?.onPress());
    await act(async () => footerProps?.onPrimary());
    await act(async () => footerProps?.onPrimary());

    expect(closeMock).not.toHaveBeenCalled();
    expect(footerProps?.label).toBe("Try again");
    expect(JSON.stringify(renderer.toJSON())).toContain("Failed to send answers. Try again.");

    await act(async () => renderer.unmount());
  });
});
