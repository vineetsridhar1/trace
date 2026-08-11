import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialRequiredArtifactActions } from "./CredentialRequiredArtifactActions";

const mutation = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/urql", () => ({ client: { mutation } }));
vi.mock("@trace/client-core", () => ({ RETRY_SESSION_CONNECTION_MUTATION: "retry-session" }));

function textContent(node: ReactTestInstance | string | number): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map((child) => textContent(child)).join("");
}

function saveButton(root: ReactTestInstance): ReactTestInstance {
  const button = root
    .findAllByType("button")
    .find((candidate) => textContent(candidate).includes("Save key and retry"));
  if (!button) throw new Error("Save button was not found");
  return button;
}

async function renderActions(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<CredentialRequiredArtifactActions provider="anthropic" sessionId="session-1" />);
  });
  return renderer;
}

async function enterKey(root: ReactTestInstance) {
  const input = root.findByType("input");
  await act(async () => {
    input.props.onChange({ target: { value: "sk-ant-secret" } });
  });
}

describe("CredentialRequiredArtifactActions", () => {
  beforeEach(() => {
    mutation.mockReset();
  });

  it("saves the key and retries the blocked session", async () => {
    mutation
      .mockReturnValueOnce({ toPromise: vi.fn().mockResolvedValue({}) })
      .mockReturnValueOnce({ toPromise: vi.fn().mockResolvedValue({}) });
    const renderer = await renderActions();
    await enterKey(renderer.root);

    await act(async () => {
      saveButton(renderer.root).props.onClick();
    });

    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation.mock.calls[0][1]).toEqual({
      input: { provider: "anthropic", token: "sk-ant-secret" },
    });
    expect(mutation.mock.calls[1][1]).toEqual({ sessionId: "session-1" });
  });

  it("does not retry when saving the key fails", async () => {
    mutation.mockReturnValueOnce({
      toPromise: vi.fn().mockResolvedValue({ error: { message: "Key rejected" } }),
    });
    const renderer = await renderActions();
    await enterKey(renderer.root);

    await act(async () => {
      saveButton(renderer.root).props.onClick();
    });

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(textContent(renderer.root)).toContain("Key rejected");
  });

  it("shows a retry failure after successfully storing the key", async () => {
    mutation
      .mockReturnValueOnce({ toPromise: vi.fn().mockResolvedValue({}) })
      .mockReturnValueOnce({
        toPromise: vi.fn().mockResolvedValue({ error: { message: "Retry unavailable" } }),
      });
    const renderer = await renderActions();
    await enterKey(renderer.root);

    await act(async () => {
      saveButton(renderer.root).props.onClick();
    });

    expect(mutation).toHaveBeenCalledTimes(2);
    expect(textContent(renderer.root)).toContain("Retry unavailable");
  });
});
