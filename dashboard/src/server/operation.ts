import { AsyncLocalStorage } from "node:async_hooks";

// One reentrant queue for power, backup, restore and Compose operations.
const state = globalThis as unknown as {
  __craftdeckOperation?: { tail: Promise<unknown>; context: AsyncLocalStorage<boolean> };
};
const queue = state.__craftdeckOperation ??= {
  tail: Promise.resolve(), context: new AsyncLocalStorage<boolean>(),
};

export function withServerOperation<T>(operation: () => Promise<T>): Promise<T> {
  if (queue.context.getStore()) return operation();
  const result = queue.tail.then(() => queue.context.run(true, operation));
  queue.tail = result.catch(() => undefined);
  return result;
}
