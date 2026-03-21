import { describe, expect, it, vi } from "vitest";
import { filterAsyncIterator } from "./async-iterator.js";

function iteratorFrom<T>(values: T[]) {
  let index = 0;

  return {
    async next() {
      if (index >= values.length) {
        return { value: undefined as T, done: true };
      }
      return { value: values[index++], done: false };
    },
    async return() {
      return { value: undefined as T, done: true };
    },
    async throw(error: Error) {
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  } satisfies AsyncIterableIterator<T>;
}

describe("filterAsyncIterator", () => {
  it("skips values until the predicate matches", async () => {
    const iterator = filterAsyncIterator(iteratorFrom([1, 2, 3]), async (value) => value > 1);

    await expect(iterator.next()).resolves.toEqual({ value: 2, done: false });
    await expect(iterator.next()).resolves.toEqual({ value: 3, done: false });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("delegates return to the underlying iterator when present", async () => {
    const inner = iteratorFrom([1]);
    const returnSpy = vi.spyOn(inner, "return");
    const iterator = filterAsyncIterator(inner, () => true);

    await iterator.return?.();

    expect(returnSpy).toHaveBeenCalled();
  });

  it("rethrows errors when the underlying iterator does not handle throw", async () => {
    const iterator = filterAsyncIterator(iteratorFrom([1]), () => true);

    await expect(iterator.throw?.(new Error("boom"))).rejects.toThrow("boom");
  });
});
