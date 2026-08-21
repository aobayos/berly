// The JetBrains-style project switcher: recents at the top, every project
// below, filter-as-you-type, arrows and Enter to pick. Doubles as the "new
// project" dialog so both live behind one keyboard-reachable surface.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectKind, ProjectMeta } from '../types';
import { newProject } from '../types';
import { deleteProject, listProjects, saveProject } from '../storage';
import { listRecents, removeRecent } from '../desktop';
import type { RecentProject } from '../desktopTypes';
import KindIcon from './KindIcon';
import { useContextMenu } from '../contextMenu';
import { useI18n } from '../i18n';
import { useTabs } from '../tabs';

export type OpenMode = 'open' | 'create';

interface Props {
  mode: OpenMode;
  onClose: () => void;
  onImportClick: () => void;
}

interface Row extends ProjectMeta {
  recent: boolean;
}

export default function OpenProjectModal({ mode, onClose, onImportClick }: Props) {
  const { t, lang } = useI18n();
  const { openProject } = useTabs();
  const showContextMenu = useContextMenu();

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [recents, setRecents] = useState<RecentProject[]>([]);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [creating, setCreating] = useState(mode === 'create');
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<ProjectKind>('movie');
  const listRef = useRef<HTMLUListElement>(null);

  function refresh() {
    void listProjects().then(setProjects);
    void listRecents().then(setRecents);
  }

  useEffect(refresh, []);

  useEffect(() => setCreating(mode === 'create'), [mode]);

  // Recents first, in the order they were last opened, then everything else
  // by last edit — the same ranking the IDEs use.
  const rows = useMemo<Row[]>(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    const recentRows: Row[] = [];
    for (const r of recents) {
      const p = byId.get(r.id);
      if (!p) continue;
      recentRows.push({ ...p, recent: true });
      byId.delete(r.id);
    }
    const rest = [...byId.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((p) => ({ ...p, recent: false }));

    const q = query.trim().toLowerCase();
    const all = [...recentRows, ...rest];
    return q ? all.filter((p) => (p.name || '').toLowerCase().includes(q)) : all;
  }, [projects, recents, query]);

  useEffect(() => setIndex(0), [query]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('.is-selected')
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  function open(id: string) {
    openProject(id);
    onClose();
  }

  function handleCreate() {
    const name = newName.trim() || t.untitled;
    const firstScript = newKind === 'show' ? `${t.defaultEpisodeName} 1` : name;
    const project = newProject(name, newKind, firstScript);
    void saveProject(project).then(() => {
      openProject(project.id, { title: project.name, kind: project.kind });
      onClose();
    });
  }

  function handleDelete(id: string) {
    if (!window.confirm(t.deleteConfirm)) return;
    void deleteProject(id).then(refresh);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && rows[index]) {
      e.preventDefault();
      open(rows[index].id);
    }
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const firstNonRecent = rows.findIndex((r) => !r.recent);

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className="modal open-modal"
        role="dialog"
        aria-modal="true"
        aria-label={creating ? t.newProject : t.menuOpenProject}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {creating ? (
          <form
            className="open-create"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <h2 className="modal-title">{t.newProject}</h2>
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
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => (mode === 'create' ? onClose() : setCreating(false))}
              >
                {t.cancel}
              </button>
              <button type="submit" className="btn btn-primary">
                {t.create}
              </button>
            </div>
          </form>
        ) : (
          <>
            <input
              autoFocus
              className="open-search"
              value={query}
              placeholder={t.openSearchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />

            {rows.length === 0 ? (
              <p className="open-empty">
                {projects.length === 0 ? t.noProjects : t.noMatches}
              </p>
            ) : (
              <ul className="open-list" ref={listRef}>
                {rows.map((row, i) => (
                  <li key={row.id}>
                    {(i === 0 && row.recent) || i === firstNonRecent ? (
                      <p className="open-section">
                        {row.recent ? t.openRecentSection : t.openAllSection}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className={`open-row ${i === index ? 'is-selected' : ''}`}
                      onPointerEnter={() => setIndex(i)}
                      onClick={() => open(row.id)}
                      onContextMenu={(e) =>
                        showContextMenu(e, [
                          { label: t.open, onSelect: () => open(row.id) },
                          {
                            label: t.openInBackground,
                            onSelect: () =>
                              openProject(row.id, {
                                background: true,
                                title: row.name,
                                kind: row.kind,
                              }),
                          },
                          { separator: true },
                          {
                            label: t.removeFromRecents,
                            disabled: !row.recent,
                            onSelect: () => {
                              removeRecent(row.id);
                              refresh();
                            },
                          },
                          {
                            label: t.deleteProject,
                            danger: true,
                            onSelect: () => handleDelete(row.id),
                          },
                        ])
                      }
                    >
                      <span className="open-row-icon" aria-hidden>
                        <KindIcon kind={row.kind} size={18} />
                      </span>
                      <span className="open-row-main">
                        <span className="open-row-name">
                          {row.name || t.untitled}
                        </span>
                        <span className="open-row-meta">
                          {row.kind === 'show'
                            ? `${row.scriptCount} ${
                                row.scriptCount === 1 ? t.episode : t.episodes
                              } · `
                            : ''}
                          {row.sceneCount}{' '}
                          {row.sceneCount === 1 ? t.scene : t.scenes} ·{' '}
                          {dateFmt.format(row.updatedAt)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="modal-actions open-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onImportClick}
              >
                {t.importProject}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setCreating(true)}
              >
                + {t.newProject}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
