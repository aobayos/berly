import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { BibleKind, ElementType, Project, Script } from '@/model/types';
import { ELEMENT_TYPES, NEXT_ELEMENT_TYPE, newElement } from '@/model/types';
import { setTitlePage } from '@/services/bibleEdit';
import { downloadFile, exportPdf } from '@/services/storage';
import {
  isFileBased,
  openDocument,
  registerFlush,
  saveDocument,
  saveDocumentAs,
  updateDocument,
  useDocument,
  writeDraft,
} from '@/services/storage/documents';
import { toFountain } from '@/services/fountain';
import { extractCharacters, extractPlaces } from '@/services/suggestions';
import { characterAliases } from '@/services/characterAliases';
import { useI18n } from '@/i18n';
import { useSelectAll } from '@/components/editor/useSelectAll';
import ElementBlock, { type FocusRequest } from '@/components/editor/ElementBlock';
import ScriptPages from '@/components/editor/ScriptPages';
import Sidebar from '@/components/editor/Sidebar';
import TitlePageView from '@/components/editor/TitlePageView';
import BibleView from '@/app/BibleView';
import ReportsView from '@/components/editor/ReportsView';
import { createHistory, pushHistory, undo, redo, type HistoryStack } from '@/services/history';
import { reorderScenes } from '@/services/sceneBlocks';
import { useIsActiveTab, useTabs } from '@/contexts/tabs';
import { useRegisterEditorCommands, type EditorView } from '@/contexts/commands';

const AUTOSAVE_DELAY = 1500;
const HISTORY_COALESCE_WINDOW = 700;

export default function Editor() {
  const { projectId = '', scriptId = '' } = useParams();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const isActiveTab = useIsActiveTab();
  const { activate } = useTabs();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  // The main pane, and the drawer beside it (the Bible or the reports for
  // this episode); see show().
  const [view, setView] = useState<'script' | 'title'>('script');
  const [drawer, setDrawer] = useState<'bible' | 'reports' | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  // Measured by ScriptPages, so the sidebar's page list and the pages on
  // screen are the same pages.
  const [pageStarts, setPageStarts] = useState<number[]>([0]);

  // The document store, not storage, is what the editor reads: this component
  // remounts on every route change (switching episodes), and unsaved edits
  // live only in memory until the writer saves.
  const doc = useDocument(projectId);
  // Every copy of the project this editor has loaded or published. Anything
  // else showing up in the store was changed from outside and gets adopted.
  const ownCopies = useRef(new WeakSet<Project>());

  useEffect(() => {
    let cancelled = false;
    openDocument(projectId).then((p) => {
      if (cancelled) return;
      if (p) ownCopies.current.add(p);
      setProject(p);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const focusSeq = useRef(0);
  const saveTimer = useRef<number | undefined>(undefined);
  const projectRef = useRef<Project | null>(project);
  projectRef.current = project;
  const dirty = useRef(false);
  const historyRef = useRef<HistoryStack<Project>>(createHistory());
  const lastHistoryPush = useRef(0);

  const script: Script | undefined = project?.scripts.find(
    (s) => s.id === scriptId
  );

  /** Moves the very latest edit into the document store, which every save
   * path reads from. Cheap — it touches memory, not the disk. */
  const publish = useCallback(() => {
    if (!projectRef.current || !dirty.current) return;
    dirty.current = false;
    ownCopies.current.add(projectRef.current);
    updateDocument(projectRef.current);
  }, []);

  // Hands pending keystrokes over when something outside the editor is about
  // to read or change this project (the episode list, an import).
  useEffect(() => registerFlush(projectId, publish), [projectId, publish]);

  // ...and takes those outside changes in. Comparing against projectRef
  // instead would mistake our own slightly older publish for a foreign copy
  // whenever it lands in the same render as a keystroke, and revert it.
  useEffect(() => {
    if (!doc || ownCopies.current.has(doc.project)) return;
    ownCopies.current.add(doc.project);
    setProject(doc.project);
  }, [doc]);

  /** The debounced write. On the desktop this is the recovery copy only: the
   * .berly file is the writer's to save, so it stays untouched until Ctrl+S.
   * In the browser, where there is no file, it remains the real save. */
  const flushDraft = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    publish();
    writeDraft(projectId);
    setSaveState('saved');
  }, [projectId, publish]);

  const handleSave = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    publish();
    void saveDocument(projectId).then(() => setSaveState('saved'));
  }, [projectId, publish]);

  const handleSaveAs = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    publish();
    void saveDocumentAs(projectId).then(() => setSaveState('saved'));
  }, [projectId, publish]);

  // Records an undo point, coalescing bursts of edits within the window into
  // a single step so continuous typing doesn't create one step per keystroke.
  const recordHistory = useCallback((prev: Project) => {
    const now = Date.now();
    if (now - lastHistoryPush.current > HISTORY_COALESCE_WINDOW) {
      pushHistory(historyRef.current, prev);
    }
    lastHistoryPush.current = now;
  }, []);

  const applyHistoryRestore = useCallback((restored: Project) => {
    // Blur first so ElementBlock's focus-guarded DOM sync isn't skipped.
    (document.activeElement as HTMLElement | null)?.blur();
    dirty.current = true;
    setProject(restored);
  }, []);

  const handleUndo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const restored = undo(historyRef.current, current);
    if (restored) applyHistoryRestore(restored);
  }, [applyHistoryRestore]);

  const handleRedo = useCallback(() => {
    const current = projectRef.current;
    if (!current) return;
    const restored = redo(historyRef.current, current);
    if (restored) applyHistoryRestore(restored);
  }, [applyHistoryRestore]);

  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  // Debounced: AUTOSAVE_DELAY ms after the last keystroke.
  useEffect(() => {
    if (!project || !dirty.current) return;
    publish();
    setSaveState('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      writeDraft(projectId);
      setSaveState('saved');
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(saveTimer.current);
  }, [project, projectId, publish]);

  // Ctrl+S, Ctrl+Z, Ctrl+Shift+Z and Ctrl+F now arrive through the command
  // registry (src/contexts/commands.tsx) — what's left here are the two keys that
  // aren't menu commands. Both are gated on the tab being visible: every
  // open tab keeps its editor mounted, so window listeners fire in all of
  // them at once.
  useEffect(() => {
    if (!isActiveTab) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && findOpen) {
        setFindOpen(false);
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActiveTab, handleRedo, findOpen]);

  // Unconditional: closing the window must flush every tab, not just the
  // visible one.
  useEffect(() => {
    window.addEventListener('beforeunload', flushDraft);
    return () => window.removeEventListener('beforeunload', flushDraft);
  }, [flushDraft]);

  // Leaving the editor (switching episode, going back) keeps the work safe
  // without claiming it was saved — it stays in the store and the recovery
  // copy, and the tab keeps showing its unsaved marker.
  useEffect(() => flushDraft, [flushDraft]);

  const touchScript = useCallback(
    (fn: (s: Script) => Script) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => {
        if (!p) return p;
        const now = Date.now();
        return {
          ...p,
          updatedAt: now,
          scripts: p.scripts.map((s) =>
            s.id === scriptId ? { ...fn(s), updatedAt: now } : s
          ),
        };
      });
    },
    [scriptId, recordHistory]
  );

  const requestFocus = useCallback(
    (id: string, pos: number | 'end', typeMenu = false) => {
      focusSeq.current += 1;
      setFocusRequest({ id, pos, seq: focusSeq.current, typeMenu });
    },
    []
  );

  const suggestionCtx = useMemo(() => {
    // Merge in Bible-declared names so a character/location the writer
    // pre-registered (but hasn't typed into the script yet) still suggests.
    const bibleNames = (kind: BibleKind) =>
      project ? project.bible.filter((b) => b.kind === kind).map((b) => b.name) : [];
    return {
      characters: project
        ? [
            ...new Set([
              ...extractCharacters(project.scripts),
              ...bibleNames('character'),
              // Either of a character's names can be typed in a cue.
              ...characterAliases(project.bible),
            ]),
          ].sort()
        : [],
      places: project
        ? [...new Set([...extractPlaces(project.scripts), ...bibleNames('location')])].sort()
        : [],
      lang,
    };
  }, [project, lang]);

  const findMatches = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (!q || !script) return [];
    return script.elements.filter((el) => el.text.toLowerCase().includes(q));
  }, [findQuery, script]);

  const handleChange = useCallback(
    (id: string, text: string) => {
      // contentEditable reports input events that changed nothing — focus
      // normalisation, an IME pass. Now that unsaved state is visible, those
      // must not mark the document dirty or the writer sees changes they
      // never made.
      if (script?.elements.find((el) => el.id === id)?.text === text) return;
      touchScript((s) => ({
        ...s,
        elements: s.elements.map((el) =>
          el.id === id ? { ...el, text } : el
        ),
      }));
    },
    [script, touchScript]
  );

  // Enter: when the current type has a logical successor (character →
  // dialogue, transition → scene, …) the new element takes it directly;
  // otherwise it falls back to the base line (Action) with the type chooser
  // open.
  const handleSplit = useCallback(
    (id: string, before: string, after: string) => {
      const currentType = script?.elements.find((el) => el.id === id)?.type;
      const successor = currentType ? NEXT_ELEMENT_TYPE[currentType] : undefined;
      // Created outside the state updater — React (StrictMode) may invoke
      // that updater twice, and generating the new element's id inside it
      // could produce two different ids, leaving requestFocus targeting
      // whichever one didn't end up rendered.
      const next = newElement(successor ?? 'action', after);
      touchScript((s) => {
        const i = s.elements.findIndex((el) => el.id === id);
        if (i === -1) return s;
        const elements = [...s.elements];
        elements[i] = { ...elements[i], text: before };
        elements.splice(i + 1, 0, next);
        return { ...s, elements };
      });
      requestFocus(next.id, 0, successor === undefined);
    },
    [script, touchScript, requestFocus]
  );

  const handleCycleType = useCallback(
    (id: string, backwards: boolean) => {
      touchScript((s) => ({
        ...s,
        elements: s.elements.map((el) => {
          if (el.id !== id) return el;
          const i = ELEMENT_TYPES.indexOf(el.type);
          const next =
            ELEMENT_TYPES[
              (i + (backwards ? -1 : 1) + ELEMENT_TYPES.length) %
                ELEMENT_TYPES.length
            ];
          return { ...el, type: next };
        }),
      }));
    },
    [touchScript]
  );

  const handleSetType = useCallback(
    (id: string, type: ElementType) => {
      touchScript((s) => ({
        ...s,
        elements: s.elements.map((el) =>
          el.id === id ? { ...el, type } : el
        ),
      }));
    },
    [touchScript]
  );

  const handleMergeBack = useCallback(
    (id: string) => {
      touchScript((s) => {
        const i = s.elements.findIndex((el) => el.id === id);
        if (i <= 0) return s;
        const prev = s.elements[i - 1];
        const current = s.elements[i];
        const elements = [...s.elements];
        elements[i - 1] = { ...prev, text: prev.text + current.text };
        elements.splice(i, 1);
        requestFocus(prev.id, prev.text.length);
        return { ...s, elements };
      });
    },
    [touchScript, requestFocus]
  );

  // Typing, deleting, cutting or pasting over Ctrl+A leaves one element of
  // the first element's type — the same thing Final Draft does.
  const handleReplaceAll = useCallback(
    (text: string) => {
      const next = newElement(script?.elements[0]?.type ?? 'scene', text);
      // Its own undo step, never folded into the typing just before it.
      lastHistoryPush.current = 0;
      touchScript((s) => ({ ...s, elements: [next] }));
      requestFocus(next.id, 'end');
    },
    [script, touchScript, requestFocus]
  );

  const mainRef = useRef<HTMLElement>(null);
  const allSelected = useSelectAll(mainRef, {
    enabled: isActiveTab && view === 'script',
    elements: script?.elements ?? [],
    onReplaceAll: handleReplaceAll,
  });

  const handleReorderScenes = useCallback(
    (fromIndex: number, toIndex: number) => {
      touchScript((s) => ({
        ...s,
        elements: reorderScenes(s.elements, fromIndex, toIndex),
      }));
    },
    [touchScript]
  );

  const handleNavigate = useCallback(
    (id: string, direction: -1 | 1) => {
      if (!script) return;
      const i = script.elements.findIndex((el) => el.id === id);
      const target = script.elements[i + direction];
      if (target) requestFocus(target.id, direction === -1 ? 'end' : 0);
    },
    [script, requestFocus]
  );

  const handleJump = useCallback(
    (elementId: string) => {
      setView('script');
      requestFocus(elementId, 'end');
      window.setTimeout(() => {
        document
          .querySelector(`[data-el-id="${elementId}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    },
    [requestFocus]
  );

  // Word-like behavior: clicking anywhere blank on the page puts the caret
  // in the nearest element.
  const handlePageMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!script || script.elements.length === 0) return;
      if ((e.target as HTMLElement).closest('.el-wrap')) return;
      e.preventDefault();

      let best = script.elements[script.elements.length - 1];
      let bestDist = Infinity;
      for (const el of script.elements) {
        const node = document.querySelector(`[data-el-id="${el.id}"]`);
        if (!node) continue;
        const rect = node.getBoundingClientRect();
        const dist =
          e.clientY < rect.top
            ? rect.top - e.clientY
            : e.clientY > rect.bottom
              ? e.clientY - rect.bottom
              : 0;
        if (dist < bestDist) {
          bestDist = dist;
          best = el;
        }
      }
      requestFocus(best.id, 'end');
    },
    [script, requestFocus]
  );

/** Any change to the project outside the script itself — the title page,
   * the Bible. One undo step like a keystroke, and saved the same way. */
  const editProject = useCallback(
    (fn: (p: Project) => Project) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => (p ? fn(p) : p));
    },
    [recordHistory]
  );

  const focusedType = useMemo<ElementType | null>(() => {
    if (!script || !focusedId) return null;
    return script.elements.find((el) => el.id === focusedId)?.type ?? null;
  }, [script, focusedId]);

  const handleExportFountain = useCallback(() => {
    if (!project || !script) return;
    downloadFile(
      `${script.name || project.name || 'script'}.fountain`,
      toFountain(project, script),
      'text/plain'
    );
  }, [project, script]);

  const handleExportPdf = useCallback(() => {
    if (!project || !script) return;
    exportPdf(project, script.id, `${script.name || project.name || 'script'}.pdf`);
  }, [project, script]);

  /** Script and title page swap the main pane; the Bible and the reports
   * open in the drawer, and asking for the open one again closes it. */
  const show = useCallback((target: EditorView) => {
    if (target === 'bible' || target === 'reports') {
      setDrawer((d) => (d === target ? null : target));
    } else {
      setView(target);
    }
  }, []);
  const showing = useCallback(
    (target: EditorView) => target === view || target === drawer,
    [view, drawer]
  );

  // Arriving from the project page's Bible or reports: go to the line asked for.
  const location = useLocation();
  const arrivalFocus = (location.state as { focus?: string } | null)?.focus;
  const arrived = useRef(false);
  useEffect(() => {
    if (loading || arrived.current || !arrivalFocus) return;
    arrived.current = true;
    if (script?.elements.some((el) => el.id === arrivalFocus)) handleJump(arrivalFocus);
  }, [loading, arrivalFocus, script, handleJump]);

  // Publishes this script's actions to the menus and keyboard. Only the
  // active tab's editor is heard (see useRegisterEditorCommands).
  useRegisterEditorCommands(
    useMemo(
      () => ({
        save: handleSave,
        saveAs: handleSaveAs,
        undo: handleUndo,
        redo: handleRedo,
        find: () => setFindOpen(true),
        exportFountain: handleExportFountain,
        exportPdf: handleExportPdf,
        show,
        showing,
        canUndo,
        canRedo,
      }),
      [
        handleSave,
        handleSaveAs,
        handleUndo,
        handleRedo,
        handleExportFountain,
        handleExportPdf,
        show,
        showing,
        canUndo,
        canRedo,
      ]
    )
  );

  if (loading) return null;

  if (!project || !script) {
    return (
      <div className="home">
        <p className="home-empty">{t.notFound}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => activate(null)}
        >
          {t.home}
        </button>
      </div>
    );
  }

  const isShow = project.kind === 'show';

  // Back is the project page, for a movie as for a show; Home is a tab of
  // its own, as in Figma.
  function handleBack() {
    flushDraft();
    navigate(`/project/${projectId}`);
  }

  return (
    <div className="editor">
      <header className="toolbar">
        <div className="toolbar-group">
          <button type="button" className="btn btn-ghost" onClick={handleBack}>
            ← {t.backToProject}
          </button>
          <span className="toolbar-project-name">
            {project.name}
            {isShow ? ` · ${script.name}` : ''}
          </span>
        </div>

        <div className="toolbar-group">
          <button
            type="button"
            className="btn btn-ghost"
            title="Ctrl+Z"
            disabled={!canUndo}
            onClick={handleUndo}
          >
            ↶
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Ctrl+Shift+Z"
            disabled={!canRedo}
            onClick={handleRedo}
          >
            ↷
          </button>
        </div>

        {/* Element types apply to the script and nothing else, so the bar
            goes away in the other views instead of sitting there greyed —
            which also gives the Bible the width it needs. */}
        <div className={`type-bar ${view === 'script' ? '' : 'is-hidden'}`}>
          {ELEMENT_TYPES.map((type, i) => (
            <button
              key={type}
              type="button"
              title={`${t.elements[type]} (Ctrl+${i + 1})`}
              className={`type-btn ${focusedType === type ? 'is-active' : ''}`}
              disabled={!focusedId || view !== 'script'}
              onMouseDown={(e) => {
                // Keep focus in the editor while clicking.
                e.preventDefault();
                if (focusedId) handleSetType(focusedId, type);
              }}
            >
              {t.elements[type]}
            </button>
          ))}
        </div>

        <div className="toolbar-group">
          {/* One segmented control rather than four bordered buttons: it is
              the narrower of the two, and the type bar needs the width. */}
          <div className="view-switch" role="tablist">
            {(
              [
                ['script', t.script],
                ['title', t.titlePage],
                ['bible', t.bibleTab],
                ['reports', t.reportsTab],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={showing(id)}
                className={`view-btn ${showing(id) ? 'is-active' : ''}`}
                onClick={() => show(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Exporting lives in the File menu — it belongs with Save, and the
              toolbar has to stay on one line. */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setLang(lang === 'en' ? 'fr' : 'en')}
          >
            {lang === 'en' ? 'FR' : 'EN'}
          </button>
          {/* The browser build saves continuously, so it reports progress;
              the desktop build owns a file the writer saves themselves, so it
              reports whether that file is up to date. */}
          {isFileBased ? (
            <button
              type="button"
              className={`save-state save-state-btn ${doc?.dirty ? '' : 'is-saved'}`}
              title="Ctrl+S"
              onClick={handleSave}
            >
              {doc?.dirty ? `• ${t.unsavedChanges}` : t.saved}
            </button>
          ) : (
            <span
              className={`save-state ${saveState === 'saved' ? 'is-saved' : ''}`}
            >
              {saveState === 'saved' ? t.saved : t.saving}
            </span>
          )}
        </div>
      </header>

      {findOpen && (
        <div className="find-panel">
          <input
            autoFocus
            className="find-input"
            value={findQuery}
            placeholder={t.findPlaceholder}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setFindOpen(false);
              }
            }}
          />
          {findQuery.trim() && (
            <ul className="find-results">
              {findMatches.length === 0 ? (
                <li className="find-empty">{t.noMatches}</li>
              ) : (
                findMatches.slice(0, 50).map((el) => (
                  <li key={el.id}>
                    <button
                      type="button"
                      onClick={() => {
                        handleJump(el.id);
                        setFindOpen(false);
                      }}
                    >
                      {el.text.trim() || t.emptyScenePlaceholder}
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}

      <div className={`editor-body ${drawer ? 'has-drawer' : ''}`}>
        <Sidebar
          elements={script.elements}
          pageStarts={pageStarts}
          onJump={handleJump}
          onReorderScenes={handleReorderScenes}
        />

        <main
          ref={mainRef}
          className={`editor-main ${allSelected ? 'is-all-selected' : ''}`}
        >
          <>
              {/* Both stay mounted (regardless of which is active on
                  screen) so PDF export (window.print) always includes the
                  title page followed by the script pages. */}
              <TitlePageView
                titlePage={project.titlePage}
                onChange={(titlePage) => editProject((p) => setTitlePage(p, titlePage))}
                className={view === 'title' ? '' : 'print-only'}
              />
              <ScriptPages
                elements={script.elements}
                hidden={view !== 'script'}
                onPageMouseDown={handlePageMouseDown}
                onPageStartsChange={setPageStarts}
                renderElement={(el) => (
                  <ElementBlock
                    key={el.id}
                    element={el}
                    placeholder={t.placeholders[el.type]}
                    focusRequest={focusRequest}
                    suggestionCtx={suggestionCtx}
                    onChange={handleChange}
                    onSplit={handleSplit}
                    onCycleType={handleCycleType}
                    onSetType={handleSetType}
                    onMergeBack={handleMergeBack}
                    onNavigate={handleNavigate}
                    onFocus={setFocusedId}
                  />
                )}
              />
          </>
          {/* These keys only do anything while writing, so they only show
              there — the Bible and the title page have their own controls. */}
          {view === 'script' && <p className="shortcuts-hint">{t.shortcutsHint}</p>}
        </main>

        {/* This episode's Bible or reports, beside the script rather than
            instead of it. The pages stay laid out underneath, which is where
            the reports get their page numbers. */}
        {drawer && (
          <aside
            className="editor-drawer"
            aria-label={drawer === 'bible' ? t.bibleTab : t.reportsTab}
          >
            <header className="editor-drawer-header">
              <span>{drawer === 'bible' ? t.bibleTab : t.reportsTab}</span>
              <button
                type="button"
                className="icon-btn"
                title={t.close}
                onClick={() => setDrawer(null)}
              >
                ✕
              </button>
            </header>
            <div className="editor-drawer-body">
              {drawer === 'bible' ? (
                <BibleView
                  project={project}
                  scope={script}
                  compact
                  onEdit={editProject}
                  onJump={handleJump}
                />
              ) : (
                <ReportsView
                  parts={[
                    {
                      scriptId: script.id,
                      name: script.name,
                      elements: script.elements,
                      pageStarts,
                    },
                  ]}
                  compact
                  bible={project.bible}
                  onJump={handleJump}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
