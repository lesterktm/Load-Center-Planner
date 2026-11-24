/** Generic undo/redo wrapper for a reducer. */

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction<A> =
  | { type: 'do'; action: A; coalesceKey?: string; at: number }
  | { type: 'undo' }
  | { type: 'redo' };

const LIMIT = 200;
/** Edits with the same key within this window merge into one undo step (typing, for example). */
const COALESCE_MS = 1500;

export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

export function withHistory<T, A>(reducer: (state: T, action: A) => T) {
  return (h: HistoryState<T>, a: HistoryAction<A>): HistoryState<T> => {
    switch (a.type) {
      case 'do': {
        const next = reducer(h.present, a.action);
        if (next === h.present) return h;
        const merge = a.coalesceKey != null && a.coalesceKey === h.lastKey && a.at - h.lastAt < COALESCE_MS;
        return {
          past: merge ? h.past : [...h.past, h.present].slice(-LIMIT),
          present: next,
          future: [],
          lastKey: a.coalesceKey ?? null,
          lastAt: a.at,
        };
      }
      case 'undo': {
        if (h.past.length === 0) return h;
        return {
          past: h.past.slice(0, -1),
          present: h.past[h.past.length - 1],
          future: [h.present, ...h.future],
          lastKey: null,
          lastAt: 0,
        };
      }
      case 'redo': {
        if (h.future.length === 0) return h;
        return {
          past: [...h.past, h.present],
          present: h.future[0],
          future: h.future.slice(1),
          lastKey: null,
          lastAt: 0,
        };
      }
    }
  };
}
