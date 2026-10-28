// A line's note: a marker in the page's left margin, and the box that opens
// from it. Both are positioned absolutely, so a note takes no room on the page
// and can't move a page break — pagination measures `.el` only.
import { useEffect, useRef, useState } from 'react';
import { ChatCenteredText } from '@phosphor-icons/react';
import { useI18n } from '@/i18n';

interface Props {
  note: string | undefined;
  open: boolean;
  onOpen(): void;
  /** `refocus` when the writer closed it from the keyboard, so the caret goes
   * back to the line; not when they clicked elsewhere, which is where they
   * meant to go. */
  onClose(note: string, refocus: boolean): void;
}

export default function NoteMarker({ note, open, onOpen, onClose }: Props) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(note ?? '');
  // Closing can be reached twice — the Delete click, then the blur of the
  // textarea it removes — and must only report once.
  const closed = useRef(false);

  useEffect(() => {
    if (!open) return;
    setDraft(note ?? '');
    closed.current = false;
    // Only on opening: the note can't change under an open box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!note && !open) return null;

  function close(text: string, refocus: boolean) {
    if (closed.current) return;
    closed.current = true;
    onClose(text, refocus);
  }

  return (
    <div className="note-anchor" contentEditable={false}>
      <button
        type="button"
        className={`note-marker ${open ? 'is-open' : ''}`}
        title={open ? undefined : note}
        aria-label={t.noteLabel}
        // Keeps the caret where it is until the box takes focus.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => (open ? close(draft, true) : onOpen())}
      >
        <ChatCenteredText size={14} weight="fill" />
      </button>
      {open && (
        <div className="note-popover" onMouseDown={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            className="note-input"
            rows={4}
            value={draft}
            placeholder={t.notePlaceholder}
            // Reopening a note carries on from the end of it.
            onFocus={(e) => e.target.setSelectionRange(draft.length, draft.length)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => close(draft, false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                e.preventDefault();
                close(draft, true);
              }
            }}
          />
          <div className="note-actions">
            <span className="note-hint">{t.noteHint}</span>
            {note && (
              <button
                type="button"
                className="btn btn-small btn-danger"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => close('', true)}
              >
                {t.noteDelete}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
