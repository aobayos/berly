// Coarse-grained undo/redo: snapshots are pushed by the caller once per
// "edit burst" (see Editor.tsx's coalescing window), not per keystroke.
const MAX_ENTRIES = 100;

export interface HistoryStack<T> {
  past: T[];
  future: T[];
}

export function createHistory<T>(): HistoryStack<T> {
  return { past: [], future: [] };
}

/** Records `prev` as an undo point and clears redo history. */
export function pushHistory<T>(stack: HistoryStack<T>, prev: T): void {
  stack.past.push(prev);
  if (stack.past.length > MAX_ENTRIES) stack.past.shift();
  stack.future = [];
}

/** Returns the state to restore, or null if there's nothing to undo. */
export function undo<T>(stack: HistoryStack<T>, current: T): T | null {
  const prev = stack.past.pop();
  if (prev === undefined) return null;
  stack.future.push(current);
  return prev;
}

/** Returns the state to restore, or null if there's nothing to redo. */
export function redo<T>(stack: HistoryStack<T>, current: T): T | null {
  const next = stack.future.pop();
  if (next === undefined) return null;
  stack.past.push(current);
  return next;
}
