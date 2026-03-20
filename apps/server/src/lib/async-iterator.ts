export function filterAsyncIterator<T>(
  iterator: AsyncIterableIterator<T>,
  predicate: (value: T) => boolean | Promise<boolean>,
): AsyncIterableIterator<T> {
  return {
    async next() {
      while (true) {
        const result = await iterator.next();
        if (result.done) return result;
        if (await predicate(result.value)) {
          return result;
        }
      }
    },
    async return() {
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
