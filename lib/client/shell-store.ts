import { useSyncExternalStore } from "react";

/**
 * A tiny client store shared by the app shell (top bar, bottom tab bar, the
 * Add menu, the people sheet) and the pages that feed it context:
 *   - the canvas reports who is selected, a profile page reports whose page it is,
 *     so the Add menu can say "Adding to Mariam";
 *   - the search asks the canvas to pan to a person (`requestFocus`).
 * No dependencies, no provider: module state + useSyncExternalStore.
 */

export type ContextPerson = {
  id: string;
  slug: string | null;
  name: string;
};

type ShellState = {
  addOpen: boolean;
  peopleSheetOpen: boolean;
  /** Person whose profile is open. */
  pagePerson: ContextPerson | null;
  /** Person selected on the tree canvas. */
  canvasPerson: ContextPerson | null;
};

let state: ShellState = {
  addOpen: false,
  peopleSheetOpen: false,
  pagePerson: null,
  canvasPerson: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<ShellState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverState: ShellState = {
  addOpen: false,
  peopleSheetOpen: false,
  pagePerson: null,
  canvasPerson: null,
};

export function useShell<T>(selector: (s: ShellState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(serverState),
  );
}

type FocusListener = (personId: string) => void;
const focusListeners = new Set<FocusListener>();

export const shell = {
  setAddOpen(open: boolean) {
    set({ addOpen: open });
  },
  openAdd() {
    set({ addOpen: true, peopleSheetOpen: false });
  },
  setPeopleSheetOpen(open: boolean) {
    set({ peopleSheetOpen: open });
  },
  setPagePerson(person: ContextPerson | null) {
    set({ pagePerson: person });
  },
  setCanvasPerson(person: ContextPerson | null) {
    const cur = state.canvasPerson;
    if (cur?.id === person?.id && cur?.name === person?.name) return;
    set({ canvasPerson: person });
  },
  /** The person the Add menu should act on: the open profile wins, then the canvas selection. */
  contextPerson(): ContextPerson | null {
    return state.pagePerson ?? state.canvasPerson;
  },
  /**
   * Ask a mounted canvas to pan/zoom to a person and select them.
   * Returns false when no canvas is listening (caller should navigate to `/?focus=`).
   */
  requestFocus(personId: string): boolean {
    if (focusListeners.size === 0) return false;
    focusListeners.forEach((l) => l(personId));
    return true;
  },
  onFocusRequest(listener: FocusListener) {
    focusListeners.add(listener);
    return () => {
      focusListeners.delete(listener);
    };
  },
};
