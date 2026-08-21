// VS Code-style strip of open projects. One tab per project; the panes
// behind them all stay mounted (see Workspace.tsx).
import { useState } from 'react';
import KindIcon from './KindIcon';
import { useContextMenu } from '../contextMenu';
import { useDocument } from '../documents';
import { useI18n } from '../i18n';
import { useTabs } from '../tabs';

export default function TabBar({ onNewTab }: { onNewTab: () => void }) {
  const { tabs, activeId, activate, closeTab, closeOthers, closeAll, moveTab } =
    useTabs();
  const { t } = useI18n();
  const showContextMenu = useContextMenu();
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  if (tabs.length === 0) return null;

  return (
    <div className="tabbar" role="tablist">
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          role="tab"
          aria-selected={tab.id === activeId}
          tabIndex={-1}
          draggable
          className={[
            'tab',
            tab.id === activeId ? 'is-active' : '',
            dragging === tab.id ? 'is-dragging' : '',
            dropIndex === i && dragging !== tab.id ? 'is-drop-target' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onPointerDown={(e) => {
            // Middle-click closes, matching every tabbed app.
            if (e.button === 1) {
              e.preventDefault();
              closeTab(tab.id);
            } else if (e.button === 0) {
              activate(tab.id);
            }
          }}
          onDragStart={(e) => {
            setDragging(tab.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            setDropIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragging) moveTab(dragging, i);
            setDragging(null);
            setDropIndex(null);
          }}
          onDragEnd={() => {
            setDragging(null);
            setDropIndex(null);
          }}
          onContextMenu={(e) =>
            showContextMenu(e, [
              {
                label: t.menuCloseTab,
                accelerator: 'Mod+W',
                onSelect: () => closeTab(tab.id),
              },
              {
                label: t.tabCloseOthers,
                disabled: tabs.length < 2,
                onSelect: () => closeOthers(tab.id),
              },
              { label: t.tabCloseAll, onSelect: closeAll },
            ])
          }
        >
          <span className="tab-icon" aria-hidden>
            <KindIcon kind={tab.kind} size={15} />
          </span>
          <span className="tab-title">{tab.title || t.untitled}</span>
          <TabCloseButton projectId={tab.projectId} onClose={() => closeTab(tab.id)} />
        </div>
      ))}

      <button
        type="button"
        className="tab-new"
        title={`${t.menuOpenProject} (Ctrl+O)`}
        aria-label={t.menuOpenProject}
        onClick={onNewTab}
      >
        +
      </button>
    </div>
  );
}

/** Doubles as the unsaved marker: a dot while the project has changes that
 * aren't in its file, turning back into ✕ on hover — the same trade every
 * document-based editor makes to keep the strip quiet. */
function TabCloseButton({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const doc = useDocument(projectId);
  const dirty = Boolean(doc?.dirty);

  return (
    <button
      type="button"
      className={`tab-close ${dirty ? 'is-dirty' : ''}`}
      title={dirty ? t.unsavedChanges : t.menuCloseTab}
      aria-label={t.menuCloseTab}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <span className="tab-close-mark" aria-hidden>
        ✕
      </span>
      <span className="tab-dirty-mark" aria-hidden>
        ●
      </span>
    </button>
  );
}
