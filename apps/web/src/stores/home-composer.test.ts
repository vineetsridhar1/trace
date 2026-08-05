import { beforeEach, describe, expect, it } from "vitest";
import { homeComposerDraftScope, useHomeComposerStore } from "./home-composer";

describe("home composer store", () => {
  beforeEach(() => {
    useHomeComposerStore.setState({ focusRequest: 0, prefill: null, drafts: {} });
  });

  it("keeps in-memory drafts isolated by user and organization", () => {
    const firstUser = homeComposerDraftScope("user-1", "org-1");
    const secondUser = homeComposerDraftScope("user-2", "org-1");

    useHomeComposerStore.getState().setDraft(firstUser, "private draft");

    expect(useHomeComposerStore.getState().drafts[firstUser]).toBe("private draft");
    expect(useHomeComposerStore.getState().drafts[secondUser]).toBeUndefined();
  });

  it("lets a newer focus request supersede an unconsumed prefill", () => {
    useHomeComposerStore.getState().requestFocus("Old command text");
    useHomeComposerStore.getState().requestFocus();

    expect(useHomeComposerStore.getState().prefill).toBeNull();
  });
});
