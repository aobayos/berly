// Open-project tabs. A tab is one project; each gets its own router (see
// Workspace.tsx), and every open tab stays mounted so switching away and
// back preserves editor state — caret, undo history, pending autosave.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { ProjectKind } from '../model/types';
import { newId } from '../model/types';
import { loadProject } from '../storage';
import { addRecent } from '../desktop/bridge';
import { closeDocument, discardDocument, documentState, isFileBased } from '../storage/documents';
import { useUnsavedGuard } from './UnsavedGuard';

export interface Tab {
  id: string;
  projectId: string;
  title: string;
  kind: ProjectKind;
  /** Current route within this tab's own router. */
  path: string;
}

export interface TabMeta {
  title?: string;
  kind?: ProjectKind;
}

interface OpenOptions extends TabMeta {
  /** Open without stealing focus from the current tab. */
  background?: boolean;
}

interface TabsValue {
  tabs: Tab[];
  activeId: string | null;
  activeTab: Tab | null;
  openProject(projectId: string, options?: OpenOptions): void;
  closeTab(id: string): void;
  closeOthers(id: string): void;
  closeAll(): void;
  /** Re-points an existing tab at a different project — what picking a
   * project from the in-tab home page does. */
  setTabProject(id: string, projectId: string, meta?: TabMeta): void;
  activate(id: string): void;
  /** Moves +1/-1 through the strip, wrapping at both ends. */
  cycle(delta: 1 | -1): void;
  activateIndex(index: number): void;
  moveTab(id: string, toIndex: number): void;
  setTabPath(id: string, path: string): void;
}

const TabsContext = createContext<TabsValue | null>(null);

/** True when the surrounding tab is the visible one. Global key handlers in
 * hidden tabs must stand down — window listeners fire regardless of which
 * pane is on screen. */
const ActiveTabContext = createContext(true);

export function useTabs(): TabsValue {
  const value = useContext(TabsContext);
  if (!value) throw new Error('useTabs must be used inside <TabsProvider>');
  return value;
}

export function useIsActiveTab(): boolean {
  return useContext(ActiveTabContext);
}

export const ActiveTabProvider = ActiveTabContext.Provider;

const SESSION_KEY = 'berly.tabs';

interface Session {
  tabs: Tab[];
  activeId: string | null;
}

function loadSession(): Session {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
    if (!raw || !Array.isArray(raw.tabs)) return { tabs: [], activeId: null };
    const tabs = (raw.tabs as Tab[]).filter(
      (t) => t && typeof t.id === 'string' && typeof t.projectId === 'string'
    );
    const activeId = tabs.some((t) => t.id === raw.activeId)
      ? (raw.activeId as string)
      : (tabs[0]?.id ?? null);
    return { tabs, activeId };
  } catch {
    return { tabs: [], activeId: null };
  }
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>(loadSession);
  const { tabs, activeId } = session;
  const guard = useUnsavedGuard();

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }, [session]);

  // Tabs restored from a previous run may point at projects that have since
  // been deleted; drop those rather than showing a dead "Not found" pane.
  const pruned = useRef(false);
  useEffect(() => {
    if (pruned.current) return;
    pruned.current = true;
    const restored = loadSession().tabs;
    if (restored.length === 0) return;
    Promise.all(
      restored.map((t) => loadProject(t.projectId).then((p) => [t.id, p] as const))
    ).then((results) => {
      const dead = new Set(
        results.filter(([, p]) => !p).map(([id]) => id)
      );
      const live = new Map(
        results
          .filter((r): r is [string, NonNullable<(typeof r)[1]>] => Boolean(r[1]))
          .map(([id, p]) => [id, p])
      );
      if (dead.size === 0 && live.size === 0) return;
      setSession((s) => {
        const next = s.tabs
          .filter((t) => !dead.has(t.id))
          .map((t) => {
            const p = live.get(t.id);
            return p ? { ...t, title: p.name, kind: p.kind } : t;
          });
        return {
          tabs: next,
          activeId: next.some((t) => t.id === s.activeId)
            ? s.activeId
            : (next[0]?.id ?? null),
        };
      });
    });
  }, []);

  /** Fills a tab's name/kind in from storage and records the project as
   * recently opened. Callers that already know the metadata still go through
   * here, because only storage can confirm the project actually exists. */
  const hydrate = useCallback((projectId: string) => {
    void loadProject(projectId).then((p) => {
      if (!p) return;
      addRecent(p.id, p.name, p.kind);
      setSession((s) => ({
        ...s,
        tabs: s.tabs.map((t) =>
          t.projectId === projectId ? { ...t, title: p.name, kind: p.kind } : t
        ),
      }));
    });
  }, []);

  const openProject = useCallback(
    (projectId: string, options: OpenOptions = {}) => {
      setSession((s) => {
        // One tab per project — reopening an already-open project focuses it,
        // the way VS Code and the JetBrains IDEs both behave.
        const existing = s.tabs.find((t) => t.projectId === projectId);
        if (existing) {
          return options.background ? s : { ...s, activeId: existing.id };
        }
        const tab: Tab = {
          id: newId(),
          projectId,
          title: options.title ?? '',
          kind: options.kind ?? 'movie',
          path: `/project/${projectId}`,
        };
        return {
          tabs: [...s.tabs, tab],
          activeId: options.background ? s.activeId : tab.id,
        };
      });
      hydrate(projectId);
    },
    [hydrate]
  );

  const setTabProject = useCallback(
    (id: string, projectId: string, meta: TabMeta = {}) => {
      setSession((s) => ({
        ...s,
        tabs: s.tabs.map((t) =>
          t.id === id
            ? {
                ...t,
                projectId,
                title: meta.title ?? '',
                kind: meta.kind ?? t.kind,
                path: `/project/${projectId}`,
              }
            : t
        ),
      }));
      hydrate(projectId);
    },
    [hydrate]
  );

  /** Asks about any unsaved work in the tabs about to close, and reports
   * whether closing may go ahead. Documents left over from tabs that do close
   * are released from the store here, in one place. */
  const releaseTabs = useCallback(
    async (closing: Tab[]): Promise<boolean> => {
      if (isFileBased) {
        const unsaved = closing
          .map((tab) => documentState(tab.projectId))
          .filter((state) => state?.dirty)
          .map((state) => ({
            id: state!.project.id,
            name: state!.project.name,
          }));

        const answer = await guard.confirm(unsaved);
        if (answer === 'cancelled') return false;
        // Discarding is a decision about the work, not just the tab: the
        // recovery copy goes with it, or it would be offered back on restart.
        if (answer === 'discarded') {
          await Promise.all(unsaved.map((doc) => discardDocument(doc.id)));
        }
      }
      for (const tab of closing) closeDocument(tab.projectId);
      return true;
    },
    [guard]
  );

  const closeTab = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      void releaseTabs([tab]).then((ok) => {
        if (!ok) return;
        setSession((s) => {
          const i = s.tabs.findIndex((t) => t.id === id);
          if (i === -1) return s;
          const next = s.tabs.filter((t) => t.id !== id);
          if (s.activeId !== id) return { ...s, tabs: next };
          // Focus the neighbour on the right, or the left when closing the last.
          const neighbour = next[Math.min(i, next.length - 1)] ?? null;
          return { tabs: next, activeId: neighbour?.id ?? null };
        });
      });
    },
    [tabs, releaseTabs]
  );

  const closeOthers = useCallback(
    (id: string) => {
      void releaseTabs(tabs.filter((t) => t.id !== id)).then((ok) => {
        if (!ok) return;
        setSession((s) => ({
          tabs: s.tabs.filter((t) => t.id === id),
          activeId: s.tabs.some((t) => t.id === id) ? id : null,
        }));
      });
    },
    [tabs, releaseTabs]
  );

  const closeAll = useCallback(() => {
    void releaseTabs(tabs).then((ok) => {
      if (ok) setSession({ tabs: [], activeId: null });
    });
  }, [tabs, releaseTabs]);

  const activate = useCallback(
    (id: string) => setSession((s) => ({ ...s, activeId: id })),
    []
  );

  const cycle = useCallback((delta: 1 | -1) => {
    setSession((s) => {
      if (s.tabs.length < 2) return s;
      const i = s.tabs.findIndex((t) => t.id === s.activeId);
      const next = (i + delta + s.tabs.length) % s.tabs.length;
      return { ...s, activeId: s.tabs[next].id };
    });
  }, []);

  const activateIndex = useCallback((index: number) => {
    setSession((s) => {
      // Ctrl+9 jumps to the last tab, matching browsers and VS Code.
      const target = index === 8 ? s.tabs[s.tabs.length - 1] : s.tabs[index];
      return target ? { ...s, activeId: target.id } : s;
    });
  }, []);

  const moveTab = useCallback((id: string, toIndex: number) => {
    setSession((s) => {
      const from = s.tabs.findIndex((t) => t.id === id);
      if (from === -1) return s;
      const to = Math.max(0, Math.min(toIndex, s.tabs.length - 1));
      if (from === to) return s;
      const next = [...s.tabs];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return { ...s, tabs: next };
    });
  }, []);

  const setTabPath = useCallback((id: string, path: string) => {
    setSession((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      if (!tab || tab.path === path) return s;
      return {
        ...s,
        tabs: s.tabs.map((t) => (t.id === id ? { ...t, path } : t)),
      };
    });
  }, []);

  const value = useMemo<TabsValue>(
    () => ({
      tabs,
      activeId,
      activeTab: tabs.find((t) => t.id === activeId) ?? null,
      openProject,
      closeTab,
      closeOthers,
      closeAll,
      setTabProject,
      activate,
      cycle,
      activateIndex,
      moveTab,
      setTabPath,
    }),
    [
      tabs,
      activeId,
      openProject,
      closeTab,
      closeOthers,
      closeAll,
      setTabProject,
      activate,
      cycle,
      activateIndex,
      moveTab,
      setTabPath,
    ]
  );

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
}
