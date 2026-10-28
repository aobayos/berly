// Where a project opens, movie or series alike: its script (or episodes),
// title page, Bible and reports, each a section of the page. Scripts are
// opened from here, and the editor's back button returns here.
//
// Changes made on this page go to the open document the way the editor's do:
// in memory at once, to the recovery copy (desktop) or storage (browser)
// after a pause, and to the .berly file on Ctrl+S.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  commitProject,
  documentState,
  isFileBased,
  openDocument,
  saveDocument,
  saveDocumentAs,
  updateDocument,
  useDocument,
  writeDraft,
} from '@/services/storage/documents';
import type { Project, Script } from '@/model/types';
import { newScript } from '@/model/types';
import { setTitlePage } from '@/services/bibleEdit';
import type { ReportPart } from '@/services/scriptReport';
import { useI18n } from '@/i18n';
import { useTabs } from '@/contexts/tabs';
import {
  useRegisterEditorCommands,
  useShellActions,
  type EditorView,
} from '@/contexts/commands';
import BibleView from '@/app/BibleView';
import ReportsView from '@/components/editor/ReportsView';
import MeasuredPages from '@/components/editor/MeasuredPages';
import TitlePageView from '@/components/editor/TitlePageView';

/** Same pause as the editor's autosave. */
const DRAFT_DELAY = 1500;

export default function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useI18n();
  const { activate } = useTabs();
  const { importEpisode } = useShellActions();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  // 'script' is the script or episode list; the rest mirror the editor.
  const [section, setSection] = useState<EditorView>('script');
  // The open document, not storage: the editor writes there, and episodes
  // added here have to be visible to it the moment it mounts.
  const doc = useDocument(projectId);
  const project: Project | null = doc?.project ?? null;

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

  // ---------- Editing ----------

  const draftTimer = useRef<number | undefined>(undefined);
  const flushDraft = useCallback(() => {
    if (draftTimer.current === undefined) return;
    window.clearTimeout(draftTimer.current);
    draftTimer.current = undefined;
    writeDraft(projectId);
  }, [projectId]);

  /** Typing in the title page or the Bible: memory now, the draft after a
   * pause, like a keystroke in the editor. */
  const editProject = useCallback(
    (fn: (p: Project) => Project) => {
      const current = documentState(projectId)?.project;
      if (!current) return;
      updateDocument(fn(current));
      window.clearTimeout(draftTimer.current);
      draftTimer.current = window.setTimeout(() => {
        draftTimer.current = undefined;
        writeDraft(projectId);
      }, DRAFT_DELAY);
    },
    [projectId]
  );

  // Leaving the page or closing the window keeps pending typing safe.
  useEffect(() => flushDraft, [flushDraft]);
  useEffect(() => {
    window.addEventListener('beforeunload', flushDraft);
    return () => window.removeEventListener('beforeunload', flushDraft);
  }, [flushDraft]);

  const handleSave = useCallback(() => {
    flushDraft();
    void saveDocument(projectId);
  }, [projectId, flushDraft]);

  const handleSaveAs = useCallback(() => {
    flushDraft();
    void saveDocumentAs(projectId);
  }, [projectId, flushDraft]);

  useRegisterEditorCommands(
    useMemo(
      () => ({
        save: handleSave,
        saveAs: handleSaveAs,
        show: setSection,
        showing: (view: EditorView) => view === section,
        canUndo: false,
        canRedo: false,
      }),
      [handleSave, handleSaveAs, section]
    )
  );

  /** Episodes added, renamed or removed. `save`: write the file now rather
   * than wait for Ctrl+S, which a rename gives no reason to think of. A
   * project with no file yet stays unsaved rather than throwing a Save dialog
   * at a rename. */
  function mutate(fn: (p: Project) => void, save = false) {
    if (!project) return;
    const next = { ...project, scripts: [...project.scripts], updatedAt: Date.now() };
    fn(next);
    void commitProject(next).then(() => {
      if (save && documentState(next.id)?.path) void saveDocument(next.id);
    });
  }

  function openScript(scriptId: string, focus?: string) {
    flushDraft();
    navigate(`/project/${projectId}/script/${scriptId}`, focus ? { state: { focus } } : undefined);
  }

  /** From the Bible or the reports: open whichever script holds the line. */
  function jump(elementId: string) {
    const script = project?.scripts.find((s) => s.elements.some((el) => el.id === elementId));
    if (script) openScript(script.id, elementId);
  }

  // ---------- Reports ----------

  const [pageStarts, setPageStarts] = useState<Record<string, number[]>>({});
  const onMeasured = useCallback((scriptId: string, starts: number[]) => {
    setPageStarts((all) => ({ ...all, [scriptId]: starts }));
  }, []);
  const parts = useMemo<ReportPart[]>(
    () =>
      (project?.scripts ?? []).map((s) => ({
        scriptId: s.id,
        name: s.name,
        elements: s.elements,
        pageStarts: pageStarts[s.id] ?? [0],
      })),
    [project?.scripts, pageStarts]
  );

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

  const isShow = project.kind === 'show';

  function handleNewEpisode() {
    if (!project) return;
    const name = `${t.defaultEpisodeName} ${project.scripts.length + 1}`;
    const script = newScript(name);
    mutate((p) => p.scripts.push(script));
    openScript(script.id);
  }

  function handleRename(scriptId: string) {
    const current = project?.scripts.find((s) => s.id === scriptId);
    const name = window.prompt(t.renamePrompt, current?.name ?? '');
    if (!name?.trim()) return;
    mutate((p) => {
      p.scripts = p.scripts.map((s) => (s.id === scriptId ? { ...s, name: name.trim() } : s));
    }, true);
  }

  function handleDelete(scriptId: string) {
    if (!window.confirm(t.deleteEpisodeConfirm)) return;
    mutate((p) => {
      p.scripts = p.scripts.filter((s) => s.id !== scriptId);
    }, true);
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const sections: [EditorView, string][] = [
    ['script', isShow ? t.episodesTab : t.script],
    ['title', t.titlePage],
    ['bible', t.bibleTab],
    ['reports', t.reportsTab],
  ];

  return (
    <div className="project-page">
      <header className="project-page-header">
        <h1 className="home-title">
          {project.name} <span className="badge">{isShow ? t.show : t.movie}</span>
        </h1>
        <div className="toolbar-group">
          <div className="view-switch" role="tablist">
            {sections.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className={`view-btn ${section === id ? 'is-active' : ''}`}
                onClick={() => setSection(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* The desktop owns a file the writer saves; the browser saves on
              its own, so there is nothing to report there. */}
          {isFileBased && (
            <button
              type="button"
              className={`save-state save-state-btn ${doc?.dirty ? '' : 'is-saved'}`}
              title="Ctrl+S"
              onClick={handleSave}
            >
              {doc?.dirty ? `• ${t.unsavedChanges}` : t.saved}
            </button>
          )}
        </div>
      </header>

      <div className={`project-page-body project-section-${section}`}>
        {section === 'script' && (
          <>
            {isShow && (
              <div className="home-actions project-page-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => importEpisode(projectId)}
                >
                  {t.importEpisode}
                </button>
                <button type="button" className="btn btn-primary" onClick={handleNewEpisode}>
                  + {t.newEpisode}
                </button>
              </div>
            )}
            {project.scripts.length === 0 ? (
              <p className="home-empty">{t.noEpisodes}</p>
            ) : (
              <ul className="project-grid">
                {project.scripts.map((script) => (
                  <ScriptCard
                    key={script.id}
                    script={script}
                    dateFmt={dateFmt}
                    onOpen={() => openScript(script.id)}
                    onRename={isShow ? () => handleRename(script.id) : undefined}
                    onDelete={isShow ? () => handleDelete(script.id) : undefined}
                  />
                ))}
              </ul>
            )}
          </>
        )}

        {section === 'title' && (
          <TitlePageView
            titlePage={project.titlePage}
            onChange={(titlePage) => editProject((p) => setTitlePage(p, titlePage))}
          />
        )}

        {section === 'bible' && <BibleView project={project} onEdit={editProject} onJump={jump} />}

        {section === 'reports' && (
          <>
            <MeasuredPages scripts={project.scripts} onMeasured={onMeasured} />
            <ReportsView parts={parts} series={isShow} bible={project.bible} onJump={jump} />
          </>
        )}
      </div>
    </div>
  );
}

function ScriptCard({
  script,
  dateFmt,
  onOpen,
  onRename,
  onDelete,
}: {
  script: Script;
  dateFmt: Intl.DateTimeFormat;
  onOpen(): void;
  onRename?(): void;
  onDelete?(): void;
}) {
  const { t } = useI18n();
  const scenes = script.elements.filter((el) => el.type === 'scene').length;
  const notes = script.elements.filter((el) => el.note).length;
  return (
    <li className="project-card">
      <button type="button" className="project-card-main" onClick={onOpen}>
        {/* A movie's one script is usually unnamed. */}
        <span className="project-name">{script.name || t.script}</span>
        <span className="project-meta">
          {scenes} {scenes === 1 ? t.scene : t.scenes}
          {notes > 0 && ` · ${notes} ${notes === 1 ? t.noteOne : t.noteMany}`}
        </span>
        <span className="project-meta">
          {t.lastEdited} {dateFmt.format(script.updatedAt)}
        </span>
      </button>
      {(onRename || onDelete) && (
        <div className="project-card-actions">
          {onRename && (
            <button type="button" className="btn btn-small" onClick={onRename}>
              {t.renameEpisode}
            </button>
          )}
          {onDelete && (
            <button type="button" className="btn btn-small btn-danger" onClick={onDelete}>
              {t.deleteProject}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
