import { beforeEach, describe, expect, it } from "vitest";
import { useHomeDataStore } from "./home-data";

describe("home data load state", () => {
  beforeEach(() => {
    useHomeDataStore.setState({
      organizationId: null,
      codingStatus: "idle",
      generatedStatus: "idle",
      retryRequest: 0,
    });
  });

  it("distinguishes failed loading from an empty successful result", () => {
    const store = useHomeDataStore.getState();
    store.ensureOrganization("org-1");
    store.markCodingStatus("org-1", "error");
    store.markGeneratedStatus("org-1", "ready");

    expect(useHomeDataStore.getState()).toMatchObject({
      organizationId: "org-1",
      codingStatus: "error",
      generatedStatus: "ready",
    });
  });

  it("ignores stale responses from a previous organization", () => {
    const store = useHomeDataStore.getState();
    store.ensureOrganization("org-1");
    store.ensureOrganization("org-2");
    store.markCodingStatus("org-1", "ready");

    expect(useHomeDataStore.getState()).toMatchObject({
      organizationId: "org-2",
      codingStatus: "idle",
    });
  });

  it("provides an explicit retry signal without relying on ambient refresh events", () => {
    useHomeDataStore.getState().requestRetry();

    expect(useHomeDataStore.getState().retryRequest).toBe(1);
  });
});
