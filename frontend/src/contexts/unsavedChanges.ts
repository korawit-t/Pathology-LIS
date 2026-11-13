// src/contexts/unsavedChanges.ts
//
// Pages in the dashboard are switched with React state, not the URL, so
// neither the browser nor react-router warns when the menu replaces a page
// that has unsaved edits. Pages report their edits here; Dashboard asks
// before its menu, logo or Logout leaves them.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";

interface UnsavedChangesRegistry {
  setDirty: (owner: symbol, dirty: boolean) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesRegistry | null>(null);

export const UnsavedChangesProvider = UnsavedChangesContext.Provider;

// The leave prompt is mounted at the app root, so it sits above every page
// layer: sign-off screens are opaque fixed panels at 1050 and the highest page
// modal is 3000.
export const LEAVE_CONFIRM_Z_INDEX = 3500;

/** For Dashboard: the registry to provide, and whether any page has unsaved edits. */
export function useUnsavedChangesRegistry() {
  const dirtyOwners = useRef(new Set<symbol>());
  const registry = useMemo<UnsavedChangesRegistry>(
    () => ({
      setDirty: (owner, dirty) => {
        if (dirty) dirtyOwners.current.add(owner);
        else dirtyOwners.current.delete(owner);
      },
    }),
    [],
  );
  const hasUnsavedChanges = useCallback(() => dirtyOwners.current.size > 0, []);
  return { registry, hasUnsavedChanges };
}

/**
 * For a page: while `isDirty`, the dashboard menu asks before leaving, and
 * closing or reloading the tab asks too.
 */
export function useUnsavedChangesGuard(isDirty: boolean) {
  const registry = useContext(UnsavedChangesContext);

  useEffect(() => {
    if (!isDirty || !registry) return;
    const owner = Symbol("unsaved-changes");
    registry.setDirty(owner, true);
    return () => registry.setDirty(owner, false);
  }, [isDirty, registry]);

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}
