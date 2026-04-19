export type FilterDecision = "keep" | "skip" | "end";

export function filterAsyncIterator<T>(
  iterator: AsyncIterableIterator<T>,
  predicate: (value: T) => boolean | FilterDecision | Promise<boolean | FilterDecision>,
): AsyncIterableIterator<T> {
  let ended = false;
  return {
    async next() {
      while (true) {
        if (ended) {
          if (typeof iterator.return === "function") {
            await iterator.return();
          }
          return { value: undefined as T, done: true };
        }
        const result = await iterator.next();
        if (result.done) return result;
        const decision = await predicate(result.value);
        const normalized: FilterDecision =
          decision === "end" ? "end" : decision === true || decision === "keep" ? "keep" : "skip";
        if (normalized === "end") {
          ended = true;
          if (typeof iterator.return === "function") {
            await iterator.return();
          }
          return { value: undefined as T, done: true };
        }
        if (normalized === "keep") return result;
      }
    },
    async return() {
      ended = true;
      if (typeof iterator.return === "function") {
        return iterator.return();
      }
      return { value: undefined as T, done: true };
    },
    async throw(error: Error) {
      if (typeof iterator.throw === "function") {
        return iterator.throw(error);
      }
      throw error;
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
