// Renders every open tab at once — each in its own MemoryRouter — and hides
// all but the active one with CSS. Keeping the panes mounted is the whole
// point: switching tabs preserves caret position, undo history and pending
// autosaves, which a remount would throw away.
import { useEffect } from 'react';
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import Editor from '../editor/Editor';
import EpisodeList from '../library/EpisodeList';
import ProjectList from '../library/ProjectList';
import { useShellActions } from './commands';
import { ActiveTabProvider, useTabs, type Tab } from './tabs';

/** Remounts the editor when the target script changes. */
function EditorRoute() {
  const { projectId, scriptId } = useParams();
  return <Editor key={`${projectId}/${scriptId}`} />;
}

/** Mirrors this tab's route back into the session so it survives a restart. */
function RouteSync({ tabId }: { tabId: string }) {
  const location = useLocation();
  const { setTabPath } = useTabs();
  useEffect(() => {
    setTabPath(tabId, location.pathname);
  }, [tabId, location.pathname, setTabPath]);
  return null;
}

/** The project list, reached by going Back out of a project. Picking a
 * project here re-points this tab rather than opening another one — the tab
 * behaves like a browser tab that navigated home. */
function TabHome({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const { tabs, setTabProject, openProject, activate } = useTabs();
  const { openFromFile } = useShellActions();

  return (
    <ProjectList
      onOpenProject={(id, meta) => {
        if (meta?.background) {
          openProject(id, meta);
          return;
        }
        // Already open elsewhere? Go to that tab instead of duplicating it.
        const existing = tabs.find((t) => t.projectId === id && t.id !== tab.id);
        if (existing) {
          activate(existing.id);
          return;
        }
        setTabProject(tab.id, id, meta);
        navigate(`/project/${id}`);
      }}
      onImportClick={openFromFile}
    />
  );
}

function TabPane({ tab, active }: { tab: Tab; active: boolean }) {
  return (
    <div className={`tab-pane ${active ? '' : 'is-inactive'}`}>
      <ActiveTabProvider value={active}>
        <MemoryRouter initialEntries={[tab.path]}>
          <RouteSync tabId={tab.id} />
          <Routes>
            <Route path="/" element={<TabHome tab={tab} />} />
            <Route path="/project/:projectId" element={<EpisodeList />} />
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

export default function Workspace({ empty }: { empty: React.ReactNode }) {
  const { tabs, activeId } = useTabs();

  if (tabs.length === 0) return <>{empty}</>;

  return (
    <>
      {tabs.map((tab) => (
        <TabPane key={tab.id} tab={tab} active={tab.id === activeId} />
      ))}
    </>
  );
}
