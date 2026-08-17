import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CredentialRequiredArtifactActions } from "./CredentialRequiredArtifactActions";

const mutation = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/urql", () => ({ client: { mutation } }));
vi.mock("@trace/client-core", () => ({ RETRY_SESSION_CONNECTION_MUTATION: "retry-session" }));
vi.mock("../../settings/CodexAuthenticationDialog", () => ({
  CodexAuthenticationDialog: ({
    open,
    onSave,
  }: {
    open: boolean;
    onSave: (method: "access_token", credential: string) => Promise<void>;
  }) =>
    open ? (
      <button type="button" onClick={() => onSave("access_token", "codex-access-token")}>
        Save Codex access token
      </button>
    ) : null,
}));

function textContent(node: ReactTestInstance | string | number): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return node.children.map((child) => textContent(child)).join("");
}

function saveButton(root: ReactTestInstance): ReactTestInstance {
  const button = root
    .findAllByType("button")
    .find((candidate) => textContent(candidate).includes("Connect"));
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
    input.props.onChange({
      target: { value: "sk-ant-secret" },
      currentTarget: { value: "sk-ant-secret" },
      nativeEvent: {},
    });
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

  it("saves a Codex access token and retries the blocked session", async () => {
    mutation
      .mockReturnValueOnce({ toPromise: vi.fn().mockResolvedValue({}) })
      .mockReturnValueOnce({ toPromise: vi.fn().mockResolvedValue({}) });
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<CredentialRequiredArtifactActions provider="openai" sessionId="session-1" />);
    });
    const connectButton = renderer.root
      .findAllByType("button")
      .find((candidate) => textContent(candidate).includes("Connect Codex"));
    if (!connectButton) throw new Error("Connect Codex button was not found");

    await act(async () => {
      connectButton.props.onClick();
    });
    const saveAccessTokenButton = renderer.root
      .findAllByType("button")
      .find((candidate) => textContent(candidate).includes("Save Codex access token"));
    if (!saveAccessTokenButton) throw new Error("Save Codex access token button was not found");

    await act(async () => {
      await saveAccessTokenButton.props.onClick();
    });

    expect(mutation).toHaveBeenCalledTimes(2);
    expect(mutation.mock.calls[0][1]).toEqual({
      input: { method: "access_token", credential: "codex-access-token" },
    });
    expect(mutation.mock.calls[1][1]).toEqual({ sessionId: "session-1" });
  });
});
