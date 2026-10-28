// Renders Home and every open tab at once — each project tab in its own
// MemoryRouter — and hides all but the active one with CSS. Keeping the panes
// mounted is the whole point: switching tabs preserves caret position, undo
// history and pending autosaves, which a remount would throw away.
import { useEffect, useRef, type ReactNode } from 'react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from 'react-router-dom';
import Editor from '@/app/Editor';
import ProjectPage from '@/app/ProjectPage';
import { ActiveTabProvider, useTabs, type Tab } from '@/contexts/tabs';

/** Remounts the editor when the target script changes. */
function EditorRoute() {
  const { projectId, scriptId } = useParams();
  return <Editor key={`${projectId}/${scriptId}`} />;
}

/** Mirrors this tab's route back into the session so it survives a restart
 * (and reaches the address bar), and follows the route the other way when
 * the address bar asks for one. */
function RouteSync({ tab }: { tab: Tab }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const { setTabPath } = useTabs();

  useEffect(() => {
    setTabPath(
      tab.id,
      location.pathname,
      navigationType === 'REPLACE' ? 'replace' : 'push'
    );
  }, [tab.id, location.pathname, navigationType, setTabPath]);

  // Keyed on navSeq alone: tab.path also changes every time the router moves
  // by itself, and following that would be a loop. A request made before
  // this router existed is already its initial entry.
  const handledNav = useRef(tab.navSeq);
  useEffect(() => {
    if (tab.navSeq === handledNav.current) return;
    handledNav.current = tab.navSeq;
    navigate(tab.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.navSeq]);

  return null;
}

function TabPane({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <div className={`tab-pane ${active ? '' : 'is-inactive'}`}>
      <ActiveTabProvider value={active}>
        <MemoryRouter initialEntries={[tab.path]}>
          <RouteSync tab={tab} />
          <Routes>
            <Route path="/project/:projectId" element={<ProjectPage />} />
            <Route
              path="/project/:projectId/script/:scriptId"
              element={<EditorRoute />}
            />
            <Route
              path="*"
              element={<Navigate to={`/project/${tab.projectId}`} replace />}
            />
          </Routes>
        </MemoryRouter>
      </ActiveTabProvider>
    </div>
  );
}

/** `home` is what the Home tab shows — the project list. */
export default function Workspace({ home }: { home: ReactNode }) {
  const { tabs, activeId } = useTabs();

  return (
    <>
      <div className={`tab-pane ${activeId === null ? '' : 'is-inactive'}`}>
        <ActiveTabProvider value={activeId === null}>{home}</ActiveTabProvider>
      </div>
      {tabs.map((tab) => (
        <TabPane key={tab.id} tab={tab} active={tab.id === activeId} />
      ))}
    </>
  );
}
