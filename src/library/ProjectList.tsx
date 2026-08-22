import { useEffect, useState } from 'react';
import type { ProjectKind, ProjectMeta } from '../model/types';
import { newProject } from '../model/types';
import {
  deleteProject,
  downloadFile,
  listProjects,
  loadProject,
  saveProject,
} from '../storage';
import KindIcon from '../ui/KindIcon';
import { useContextMenu } from '../shell/contextMenu';
import { isFileBased } from '../storage/documents';
import { useShellActions } from '../shell/commands';
import { useI18n } from '../i18n';

interface Props {
  /** Opens the project in a tab. The welcome screen is the only place this
   * component renders, so it never navigates on its own. */
  onOpenProject(
    id: string,
    meta?: { title: string; kind: ProjectKind; background?: boolean }
  ): void;
  onImportClick(): void;
}

export default function ProjectList({ onOpenProject, onImportClick }: Props) {
  const { t, lang, setLang } = useI18n();
  const { openFromFile } = useShellActions();
  const showContextMenu = useContextMenu();
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProjectKind>('movie');

  useEffect(() => {
    listProjects().then(setProjects);
  }, []);

  function handleCreate() {
    const name = newName.trim() || t.untitled;
    const firstScript =
      newKind === 'show' ? `${t.defaultEpisodeName} 1` : name;
    const project = newProject(name, newKind, firstScript);
    saveProject(project).then(() =>
      onOpenProject(project.id, { title: project.name, kind: project.kind })
    );
  }

  // On the desktop the project is a file the writer owns, so this drops it
  // from the list and sends the file to the recycle bin rather than
  // destroying it — hence the different wording there.
  const removeLabel = isFileBased ? t.removeFromList : t.deleteProject;

  function handleDelete(id: string) {
    if (!window.confirm(isFileBased ? t.removeFromListConfirm : t.deleteConfirm)) return;
    deleteProject(id).then(() => listProjects().then(setProjects));
  }

  function handleExport(id: string) {
    loadProject(id).then((project) => {
      if (!project) return;
      downloadFile(
        `${project.name || 'script'}.berly.json`,
        JSON.stringify(project, null, 2)
      );
    });
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="home">
      <header className="home-header">
        <div>
          <h1 className="home-logo">BERLY</h1>
          <p className="home-tagline">{t.appTagline}</p>
        </div>
        <div className="home-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
            title={lang === 'en' ? 'Passer en français' : 'Switch to English'}
          >
            {lang === 'en' ? 'FR' : 'EN'}
          </button>
          {/* On the desktop, opening a .berly file from anywhere on disk is
              the main way in — importing a copy is the browser's compromise. */}
          {isFileBased ? (
            <button type="button" className="btn btn-ghost" onClick={openFromFile}>
              {t.menuOpenFile}
            </button>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={onImportClick}>
              {t.importProject}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setCreating(true)}
          >
            + {t.newProject}
          </button>
        </div>
      </header>

      {creating && (
        <form
          className="create-form"
          onSubmit={(e) => {
            e.preventDefault();
            handleCreate();
          }}
        >
          <div className="kind-toggle">
            <button
              type="button"
              className={`btn ${newKind === 'movie' ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setNewKind('movie')}
            >
              <KindIcon kind="movie" /> {t.movie}
            </button>
            <button
              type="button"
              className={`btn ${newKind === 'show' ? 'btn-active' : 'btn-ghost'}`}
              onClick={() => setNewKind('show')}
            >
              <KindIcon kind="show" /> {t.show}
            </button>
          </div>
          <input
            autoFocus
            className="create-input"
            value={newName}
            placeholder={t.newProjectNamePlaceholder}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button type="submit" className="btn btn-primary">
            {t.create}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setCreating(false);
              setNewName('');
            }}
          >
            {t.cancel}
          </button>
        </form>
      )}

      {projects.length === 0 && !creating ? (
        <p className="home-empty">{t.noProjects}</p>
      ) : (
        <ul className="project-grid">
          {projects.map((p) => (
            <li key={p.id} className="project-card">
              <button
                type="button"
                className="project-card-main"
                onClick={() => onOpenProject(p.id, { title: p.name, kind: p.kind })}
                onContextMenu={(e) =>
                  showContextMenu(e, [
                    {
                      label: t.open,
                      onSelect: () =>
                        onOpenProject(p.id, { title: p.name, kind: p.kind }),
                    },
                    {
                      label: t.openInBackground,
                      onSelect: () =>
                        onOpenProject(p.id, {
                          title: p.name,
                          kind: p.kind,
                          background: true,
                        }),
                    },
                    { separator: true },
                    { label: t.exportProject, onSelect: () => handleExport(p.id) },
                    {
                      label: removeLabel,
                      danger: true,
                      onSelect: () => handleDelete(p.id),
                    },
                  ])
                }
              >
                <span className="project-name">
                  {p.name || t.untitled}{' '}
                  <span className="badge">
                    {p.kind === 'show' ? t.show : t.movie}
                  </span>
                </span>
                <span className="project-meta">
                  {p.kind === 'show'
                    ? `${p.scriptCount} ${
                        p.scriptCount === 1 ? t.episode : t.episodes
                      } · `
                    : ''}
                  {p.sceneCount} {p.sceneCount === 1 ? t.scene : t.scenes}
                </span>
                <span className="project-meta">
                  {t.lastEdited} {dateFmt.format(p.updatedAt)}
                </span>
              </button>
              <div className="project-card-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => handleExport(p.id)}
                >
                  {t.exportProject}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => handleDelete(p.id)}
                >
                  {removeLabel}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
