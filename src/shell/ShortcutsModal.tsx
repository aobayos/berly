// Help ▸ Keyboard Shortcuts. The application shortcuts are rendered from the
// command registry, so the sheet can't drift from what the keys actually do;
// the editor's own in-block keys (Enter, Tab, Ctrl+1–9…) aren't commands and
// are listed alongside them.
import { useEffect } from 'react';
import { groupCommands, type Command } from './commands';
import { formatAccelerator } from './shortcuts';
import { useI18n } from '../i18n';

interface Props {
  commands: Command[];
  onClose: () => void;
}

export default function ShortcutsModal({ commands, onClose }: Props) {
  const { t } = useI18n();
  const groups = groupCommands(commands, t);

  // Nothing here is focusable on open, so Escape has to be caught globally.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const editorKeys: [string, string][] = [
    ['Enter', t.keyEnter],
    ['Tab', t.keyTab],
    ['Mod+1…9', t.keyElementType],
    ['Mod+Space', t.keySuggestions],
    ['Backspace', t.keyMerge],
  ];

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className="modal shortcuts-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.menuShortcuts}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">{t.menuShortcuts}</h2>

        <div className="shortcuts-grid">
          {groups.map((group) => (
            <section key={group.title}>
              <h3 className="shortcuts-heading">{group.title}</h3>
              <ul className="shortcuts-list">
                {group.items.map((c) => (
                  <li key={c.id}>
                    <span>{c.id.startsWith('tab.select') ? t.menuGoToTab : c.label}</span>
                    <kbd>
                      {c.id.startsWith('tab.select')
                        ? formatAccelerator('Alt+1') + '…9'
                        : formatAccelerator(c.accelerator!)}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h3 className="shortcuts-heading">{t.keyEditorSection}</h3>
            <ul className="shortcuts-list">
              {editorKeys.map(([key, label]) => (
                <li key={key}>
                  <span>{label}</span>
                  <kbd>{formatAccelerator(key)}</kbd>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
