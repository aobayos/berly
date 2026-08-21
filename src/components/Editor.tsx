import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type {
  BibleKind,
  ElementType,
  Project,
  Script,
  SheetSection,
  TitlePage,
} from '../types';
import { ELEMENT_TYPES, NEXT_ELEMENT_TYPE, newElement } from '../types';
import { builtInTemplates, toTemplate } from '../characterSheet';
import { downloadFile, exportPdf } from '../storage';
import {
  isFileBased,
  openDocument,
  saveDocument,
  saveDocumentAs,
  updateDocument,
  useDocument,
  writeDraft,
} from '../documents';
import { toFountain } from '../fountain';
import { extractCharacters, extractPlaces } from '../suggestions';
import { useI18n } from '../i18n';
import ElementBlock, { type FocusRequest } from './ElementBlock';
import ScriptPages from './ScriptPages';
import Sidebar from './Sidebar';
import TitlePageView from './TitlePageView';
import BibleView from './BibleView';
import { createHistory, pushHistory, undo, redo, type HistoryStack } from '../history';
import { reorderScenes } from '../sceneBlocks';
import { useIsActiveTab } from '../tabs';
import { useRegisterEditorCommands } from '../appCommands';

const AUTOSAVE_DELAY = 1500;
const HISTORY_COALESCE_WINDOW = 700;

export default function Editor() {
  const { projectId = '', scriptId = '' } = useParams();
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const isActiveTab = useIsActiveTab();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'script' | 'title' | 'bible'>('script');
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

  useEffect(() => {
    let cancelled = false;
    openDocument(projectId).then((p) => {
      if (cancelled) return;
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
    updateDocument(projectRef.current);
  }, []);

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
  // registry (src/appCommands.tsx) — what's left here are the two keys that
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
        ? [...new Set([...extractCharacters(project.scripts), ...bibleNames('character')])].sort()
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

  const handleTitlePageChange = useCallback(
    (titlePage: TitlePage) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => (p ? { ...p, titlePage, updatedAt: Date.now() } : p));
    },
    [recordHistory]
  );

  const handleBibleNoteChange = useCallback(
    (name: string, kind: BibleKind, note: string) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => {
        if (!p) return p;
        const exists = p.bible.some((b) => b.name === name && b.kind === kind);
        const bible = exists
          ? p.bible.map((b) => (b.name === name && b.kind === kind ? { ...b, note } : b))
          : [...p.bible, { name, kind, note }];
        return { ...p, bible, updatedAt: Date.now() };
      });
    },
    [recordHistory]
  );

  const handleBibleAdd = useCallback(
    (name: string, kind: BibleKind) => {
      const normalized = name.trim().toUpperCase();
      if (!normalized) return;
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => {
        if (!p) return p;
        if (p.bible.some((b) => b.name === normalized && b.kind === kind)) return p;
        return {
          ...p,
          bible: [...p.bible, { name: normalized, kind, note: '' }],
          updatedAt: Date.now(),
        };
      });
    },
    [recordHistory]
  );

  /** Sheets are stored on the Bible entry, creating it if the writer is
   * filling in a name that so far only exists in the script. */
  const handleBibleSheetChange = useCallback(
    (name: string, kind: BibleKind, sheet: SheetSection[]) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => {
        if (!p) return p;
        const exists = p.bible.some((b) => b.name === name && b.kind === kind);
        const bible = exists
          ? p.bible.map((b) =>
              b.name === name && b.kind === kind ? { ...b, sheet } : b
            )
          : [...p.bible, { name, kind, note: '', sheet }];
        return { ...p, bible, updatedAt: Date.now() };
      });
    },
    [recordHistory]
  );

  /** Promotes a sheet's layout — its sections and labels, without the
   * answers — to the shape new sheets of that kind start from. */
  const handleSaveSheetTemplate = useCallback(
    (kind: BibleKind, sheet: SheetSection[]) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) => {
        if (!p) return p;
        const current = p.sheetTemplates ?? builtInTemplates();
        return {
          ...p,
          sheetTemplates: { ...current, [kind]: toTemplate(sheet) },
          updatedAt: Date.now(),
        };
      });
    },
    [recordHistory, t]
  );

  const handleBibleRemove = useCallback(
    (name: string, kind: BibleKind) => {
      if (projectRef.current) recordHistory(projectRef.current);
      dirty.current = true;
      setProject((p) =>
        p
          ? {
              ...p,
              bible: p.bible.filter((b) => !(b.name === name && b.kind === kind)),
              updatedAt: Date.now(),
            }
          : p
      );
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
        setView,
        view,
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
        view,
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
          onClick={() => navigate('/')}
        >
          {t.backToProjects}
        </button>
      </div>
    );
  }

  const isShow = project.kind === 'show';

  function handleBack() {
    flushDraft();
    // A movie has no episode list above it, so it goes straight home.
    navigate(isShow ? `/project/${projectId}` : '/');
  }

  return (
    <div className="editor">
      <header className="toolbar">
        <div className="toolbar-group">
          <button type="button" className="btn btn-ghost" onClick={handleBack}>
            ← {isShow ? t.backToEpisodes : t.backToProjects}
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
          <button
            type="button"
            className={`btn btn-ghost ${view === 'script' ? 'btn-active' : ''}`}
            onClick={() => setView('script')}
          >
            {t.script}
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${view === 'title' ? 'btn-active' : ''}`}
            onClick={() => setView('title')}
          >
            {t.titlePage}
          </button>
          <button
            type="button"
            className={`btn btn-ghost ${view === 'bible' ? 'btn-active' : ''}`}
            onClick={() => setView('bible')}
          >
            {t.bibleTab}
          </button>
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

      <div className="editor-body">
        {/* The scene navigator belongs to the script; the Bible needs the
            width more than it needs a list of scenes. */}
        {view !== 'bible' && (
          <Sidebar
            elements={script.elements}
            pageStarts={pageStarts}
            onJump={handleJump}
            onReorderScenes={handleReorderScenes}
          />
        )}

        <main className="editor-main">
          {view === 'bible' ? (
            <BibleView
              project={project}
              script={script}
              onNoteChange={handleBibleNoteChange}
              onSheetChange={handleBibleSheetChange}
              onSaveTemplate={handleSaveSheetTemplate}
              onAdd={handleBibleAdd}
              onRemove={handleBibleRemove}
              onJump={handleJump}
            />
          ) : (
            <>
              {/* Both stay mounted (regardless of which is active on
                  screen) so PDF export (window.print) always includes the
                  title page followed by the script pages. */}
              <TitlePageView
                titlePage={project.titlePage}
                onChange={handleTitlePageChange}
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
          )}
          {/* These keys only do anything while writing, so they only show
              there — the Bible and the title page have their own controls. */}
          {view === 'script' && <p className="shortcuts-hint">{t.shortcutsHint}</p>}
        </main>
      </div>
    </div>
  );
}
