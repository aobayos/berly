import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { commitProject, openDocument, useDocument } from '@/services/storage/documents';
import type { Project } from '@/model/types';
import { newScript } from '@/model/types';
import { useI18n } from '@/i18n';
import { useTabs } from '@/contexts/tabs';

/** Landing page for a project: movies go straight to their single script;
 * shows display the episode list. */
export default function EpisodeList() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { activate } = useTabs();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  // The open document, not storage: the editor writes there, and episodes
  // added here have to be visible to it the moment it mounts.
  const project: Project | null = useDocument(projectId)?.project ?? null;

  useEffect(() => {
    let cancelled = false;
    openDocument(projectId).then((p) => {
      if (cancelled) return;
      setMissing(!p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (loading) return null;

  if (missing || !project) {
    return (
      <div className="home">
        <p className="home-empty">{t.notFound}</p>
        <button type="button" className="btn btn-primary" onClick={() => activate(null)}>
          {t.home}
        </button>
      </div>
    );
  }

  if (project.kind === 'movie') {
    return (
      <Navigate to={`/project/${project.id}/script/${project.scripts[0].id}`} replace />
    );
  }

  function mutate(fn: (p: NonNullable<typeof project>) => void) {
    if (!project) return;
    const next = { ...project, scripts: [...project.scripts], updatedAt: Date.now() };
    fn(next);
    void commitProject(next);
  }

  function handleNewEpisode() {
    if (!project) return;
    const name = `${t.defaultEpisodeName} ${project.scripts.length + 1}`;
    const script = newScript(name);
    mutate((p) => p.scripts.push(script));
    navigate(`/project/${project.id}/script/${script.id}`);
  }

  function handleRename(scriptId: string) {
    const current = project?.scripts.find((s) => s.id === scriptId);
    const name = window.prompt(t.renamePrompt, current?.name ?? '');
    if (!name?.trim()) return;
    mutate((p) => {
      p.scripts = p.scripts.map((s) =>
        s.id === scriptId ? { ...s, name: name.trim() } : s
      );
    });
  }

  function handleDelete(scriptId: string) {
    if (!window.confirm(t.deleteEpisodeConfirm)) return;
    mutate((p) => {
      p.scripts = p.scripts.filter((s) => s.id !== scriptId);
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
          <h1 className="home-title">
            {project.name} <span className="badge">{t.show}</span>
          </h1>
        </div>
        <div className="home-actions">
          <button type="button" className="btn btn-primary" onClick={handleNewEpisode}>
            + {t.newEpisode}
          </button>
        </div>
      </header>

      {project.scripts.length === 0 ? (
        <p className="home-empty">{t.noProjects}</p>
      ) : (
        <ul className="project-grid">
          {project.scripts.map((script) => (
            <li key={script.id} className="project-card">
              <button
                type="button"
                className="project-card-main"
                onClick={() => navigate(`/project/${project.id}/script/${script.id}`)}
              >
                <span className="project-name">{script.name}</span>
                <span className="project-meta">
                  {script.elements.filter((el) => el.type === 'scene').length}{' '}
                  {script.elements.filter((el) => el.type === 'scene').length === 1
                    ? t.scene
                    : t.scenes}
                </span>
                <span className="project-meta">
                  {t.lastEdited} {dateFmt.format(script.updatedAt)}
                </span>
              </button>
              <div className="project-card-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => handleRename(script.id)}
                >
                  {t.renameEpisode}
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => handleDelete(script.id)}
                >
                  {t.deleteProject}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
