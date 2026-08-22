// The window's entire top strip: app mark, menu bar, document title and the
// minimise/maximise/close buttons. The native frame is switched off in
// electron/main.cts, so everything here is ours to draw — and to make
// draggable (-webkit-app-region, applied in index.css).
import { useEffect, useRef, useState } from 'react';
import PopupMenu from '../ui/PopupMenu';
import type { MenuSpec } from './commands';
import {
  closeWindow,
  isDesktop,
  isMac,
  isWindowMaximized,
  minimizeWindow,
  onMaximizedChange,
  toggleMaximizeWindow,
} from '../desktop/bridge';
import { isFileBased, useDocument } from '../storage/documents';
import { useI18n } from '../i18n';
import { useTabs } from './tabs';

export default function TitleBar({ menus }: { menus: MenuSpec[] }) {
  const { activeTab } = useTabs();

  return (
    <header className={`titlebar ${isMac ? 'is-mac' : ''}`}>
      <div className="titlebar-left">
        {/* macOS keeps its own menu bar in the system chrome (built in
            electron/main.cts), so only the mark shows here. */}
        <span className="titlebar-mark" aria-hidden>
          B
        </span>
        {!isMac && <MenuBar menus={menus} />}
      </div>

      <div className="titlebar-title">
        {activeTab ? <DocumentTitle projectId={activeTab.projectId} fallback={activeTab.title} /> : 'BERLY'}
      </div>

      <div className="titlebar-right">
        {isDesktop && !isMac && <WindowControls />}
      </div>
    </header>
  );
}

/** Project name, then the file it lives in and whether that file is behind —
 * the same three facts a title bar carries in any document-based app. The
 * browser build has no file, so it shows the name alone. */
function DocumentTitle({
  projectId,
  fallback,
}: {
  projectId: string;
  fallback: string;
}) {
  const { t } = useI18n();
  const doc = useDocument(projectId);
  const name = doc?.project.name || fallback || t.untitled;

  if (!isFileBased) return <>{name}</>;

  const filename = doc?.path?.split(/[\\/]/).pop();

  return (
    <>
      {doc?.dirty && (
        <span className="titlebar-dirty" title={t.unsavedChanges} aria-hidden>
          ●
        </span>
      )}
      {name}
      <span className="titlebar-path">
        {filename ? ` — ${filename}` : ` — ${t.neverSaved}`}
      </span>
    </>
  );
}

function MenuBar({ menus }: { menus: MenuSpec[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // Alt+F/E/V/H, the way a Windows menu bar behaves.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
      const i = menus.findIndex((m) => m.mnemonic === e.key.toLowerCase());
      if (i === -1) return;
      e.preventDefault();
      setOpen((current) => (current === i ? null : i));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menus]);

  const anchor = open !== null ? buttons.current[open] : null;
  const rect = anchor?.getBoundingClientRect();

  return (
    <div className="menubar" ref={barRef}>
      {menus.map((menu, i) => (
        <button
          key={menu.label}
          type="button"
          ref={(el) => {
            buttons.current[i] = el;
          }}
          className={`menubar-item ${open === i ? 'is-open' : ''}`}
          // Pointer-down rather than click: a click would land after
          // PopupMenu's outside-press handler has already closed the menu,
          // making the button appear dead while a menu is open.
          onPointerDown={(e) => {
            e.preventDefault();
            setOpen(open === i ? null : i);
          }}
          onPointerEnter={() => open !== null && open !== i && setOpen(i)}
        >
          {menu.label}
        </button>
      ))}

      {open !== null && rect && (
        <PopupMenu
          entries={menus[open].entries()}
          x={rect.left}
          y={rect.bottom + 2}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function WindowControls() {
  const { t } = useI18n();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    void isWindowMaximized().then(setMaximized);
    return onMaximizedChange(setMaximized);
  }, []);

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-btn"
        title={t.winMinimize}
        aria-label={t.winMinimize}
        onClick={minimizeWindow}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        className="window-btn"
        title={maximized ? t.winRestore : t.winMaximize}
        aria-label={maximized ? t.winRestore : t.winMaximize}
        onClick={toggleMaximizeWindow}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          {maximized ? (
            <>
              <rect
                x="0.5"
                y="2.5"
                width="7"
                height="7"
                fill="none"
                stroke="currentColor"
              />
              <path d="M2.5 2.5V0.5h7v7h-2" fill="none" stroke="currentColor" />
            </>
          ) : (
            <rect
              x="0.5"
              y="0.5"
              width="9"
              height="9"
              fill="none"
              stroke="currentColor"
            />
          )}
        </svg>
      </button>
      <button
        type="button"
        className="window-btn window-btn-close"
        title={t.winClose}
        aria-label={t.winClose}
        onClick={closeWindow}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" fill="none" />
        </svg>
      </button>
    </div>
  );
}
