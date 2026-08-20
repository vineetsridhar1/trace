import { beforeEach, describe, expect, it, vi } from "vitest";
import { gql } from "@urql/core";

const mutation = vi.fn();
const toastError = vi.fn();

vi.mock("./urql", () => ({
  client: { mutation: (...args: unknown[]) => mutation(...args) },
}));
vi.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import { mutateOptimistically } from "./optimistic-mutation";

const DOCUMENT = gql`
  mutation Noop($id: ID!) {
    noop(id: $id)
  }
`;

function change() {
  const applied: string[] = [];
  return {
    applied,
    apply: () => {
      applied.push("apply");
      return () => void applied.push("revert");
    },
  };
}

describe("mutateOptimistically", () => {
  beforeEach(() => {
    mutation.mockReset();
    toastError.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("applies the change before the server is asked", async () => {
    const target = change();
    let appliedBeforeRequest = false;
    mutation.mockImplementation(() => {
      appliedBeforeRequest = target.applied.length === 1;
      return { toPromise: async () => ({ data: { noop: true } }) };
    });

    await expect(
      mutateOptimistically({
        ...target,
        document: DOCUMENT,
        variables: { id: "1" },
        failureMessage: "nope",
      }),
    ).resolves.toBe(true);

    expect(appliedBeforeRequest).toBe(true);
    expect(target.applied).toEqual(["apply"]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reverts and tells the user when the server refuses", async () => {
    const target = change();
    mutation.mockReturnValue({
      toPromise: async () => ({ error: { message: "Terminal not found" } }),
    });

    await expect(
      mutateOptimistically({
        ...target,
        document: DOCUMENT,
        variables: { id: "1" },
        failureMessage: "Could not close that terminal",
      }),
    ).resolves.toBe(false);

    expect(target.applied).toEqual(["apply", "revert"]);
    expect(toastError).toHaveBeenCalledWith("Could not close that terminal");
  });

  it("skips the request when there was nothing to apply", async () => {
    await expect(
      mutateOptimistically({
        apply: () => null,
        document: DOCUMENT,
        variables: { id: "1" },
        failureMessage: "nope",
      }),
    ).resolves.toBe(false);

    expect(mutation).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("reverts when the request never lands", async () => {
    const target = change();
    mutation.mockReturnValue({
      toPromise: async () => {
        throw new Error("offline");
      },
    });

    await expect(
      mutateOptimistically({
        ...target,
        document: DOCUMENT,
        variables: { id: "1" },
        failureMessage: "Could not close that tab",
      }),
    ).resolves.toBe(false);

    expect(target.applied).toEqual(["apply", "revert"]);
    expect(toastError).toHaveBeenCalledWith("Could not close that tab");
  });
});
